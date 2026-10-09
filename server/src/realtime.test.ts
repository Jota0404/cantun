// Integração do /realtime contra PostgreSQL real (docs/REALTIME_CONTRACT.md §8, RT-03 a RT-17).
// Requer psql no PATH e as variáveis PG* (as mesmas do scripts/db/verify-migrations.sh).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { after, before, describe, test } from 'node:test'
import type { FastifyInstance } from 'fastify'
import pg from 'pg'
import WebSocket from 'ws'
import { buildApp } from './app.ts'
import { newToken, tokenHash } from './auth.ts'
import { asUser, createPool } from './db.ts'
import type { Pool } from './db.ts'

const DB = 'cantum_realtime_test'
const ORIGIN = 'http://localhost:5173'
const migrate = fileURLToPath(new URL('../../scripts/db/migrate.sh', import.meta.url))
const QUIET_MS = 300

let pool: Pool
let app: FastifyInstance
let idleApp: FastifyInstance
let url: string
let idleUrl: string

interface User { id: string; cookie: string }
type Message = { type: string; [key: string]: unknown }

before(async () => {
  execFileSync('psql', ['-X', '-q', '-d', 'postgres', '-c', `drop database if exists ${DB}`, '-c', `create database ${DB}`])
  execFileSync(migrate, [DB])
  pool = createPool({ database: DB })
  app = await buildApp({
    pool, appOrigin: ORIGIN, logger: false,
    realtime: { idleTimeoutMs: 30_000, revalidateMs: 300, listenerHealthMs: 200, listenerBackoffMinMs: 500, listenerBackoffMaxMs: 500 },
  })
  url = (await app.listen({ port: 0, host: '127.0.0.1' })).replace('http', 'ws') + '/realtime'
  idleApp = await buildApp({ pool, appOrigin: ORIGIN, logger: false, realtime: { idleTimeoutMs: 300 } })
  idleUrl = (await idleApp.listen({ port: 0, host: '127.0.0.1' })).replace('http', 'ws') + '/realtime'
})

after(async () => {
  await app.close()
  await idleApp.close()
  await pool.end()
})

async function createUser(email: string): Promise<User> {
  const { rows } = await pool.query<{ id: string }>('insert into app.users (email) values ($1) returning id', [email])
  return { id: rows[0].id, cookie: await newSession(rows[0].id) }
}

async function newSession(userId: string, expired = false): Promise<string> {
  const { token, hash } = newToken()
  await pool.query(
    `insert into app.sessions (token_hash, user_id, created_at, expires_at) values ($1, $2, now() - interval '2 days', now() + ($3 || ' days')::interval)`,
    [hash, userId, expired ? '-1' : '1'],
  )
  return `cantum_session=${token}`
}

async function createOrganization(owner: User, name: string): Promise<string> {
  const id = crypto.randomUUID()
  await asUser(pool, owner.id, (client) => client.query('select public.create_organization($1, $2)', [id, name]))
  return id
}

/** Serviço com duas músicas e uma sessão de palco ao vivo, com o dono como MD. */
async function createLiveStage(owner: User, organizationId: string): Promise<string> {
  const serviceId = crypto.randomUUID()
  const stageId = crypto.randomUUID()
  await asUser(pool, owner.id, async (client) => {
    await client.query(`insert into public.services (id, organization_id, name, starts_at, created_by_user_id) values ($1, $2, 'Culto', now(), $3)`, [serviceId, organizationId, owner.id])
    for (const position of [0, 1, 2]) {
      const songId = crypto.randomUUID()
      await client.query(
        `insert into public.songs (user_id, id, title, original_key, current_key, lyrics, created_at, updated_at) values ($1, $2, 'Música', 'C', 'C', 'C', now(), now())`,
        [owner.id, songId],
      )
      await client.query('insert into public.service_items (service_id, song_id, position) values ($1, $2, $3)', [serviceId, songId, position])
    }
    await client.query('select public.create_target_stage_session($1, $2)', [serviceId, stageId])
    await client.query('select public.target_stage_start($1)', [stageId])
  })
  return stageId
}

async function rpc(user: User, name: string, payload: object) {
  return app.inject({ method: 'POST', url: `/rpc/${name}`, headers: { cookie: user.cookie, origin: ORIGIN }, payload })
}

/** Cliente de teste: guarda as mensagens recebidas e espera por elas. */
class Client {
  ws: WebSocket
  inbox: Message[] = []
  waiters: Array<() => void> = []
  closed: Promise<{ code: number }>

  constructor(ws: WebSocket) {
    this.ws = ws
    ws.on('message', (data) => {
      this.inbox.push(JSON.parse(data.toString()) as Message)
      for (const wake of this.waiters.splice(0)) wake()
    })
    this.closed = new Promise((resolve) => ws.on('close', (code) => resolve({ code })))
  }

  send(message: object | string) {
    this.ws.send(typeof message === 'string' ? message : JSON.stringify(message))
  }

  /** Próxima mensagem que satisfaz o filtro (consome as anteriores). */
  async next(filter: (message: Message) => boolean = () => true, timeoutMs = 3000): Promise<Message> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const index = this.inbox.findIndex(filter)
      if (index >= 0) return this.inbox.splice(0, index + 1)[index]
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new Error(`mensagem não chegou; recebidas: ${JSON.stringify(this.inbox)}`)
      await Promise.race([new Promise<void>((resolve) => this.waiters.push(resolve)), sleep(remaining)])
    }
  }

  /** Garante que nada que satisfaça o filtro chegou durante a janela. */
  async nothing(filter: (message: Message) => boolean = () => true) {
    await sleep(QUIET_MS)
    assert.equal(this.inbox.filter(filter).length, 0, JSON.stringify(this.inbox))
  }

  async subscribe(topic: string) {
    this.send({ type: 'subscribe', topic })
    const snapshot = await this.next((m) => m.type === 'snapshot' || m.type === 'error')
    assert.equal(snapshot.type, 'snapshot', JSON.stringify(snapshot))
    const presence = await this.next((m) => m.type === 'presence')
    return { snapshot, presence }
  }

  close() {
    this.ws.close(1000)
    return this.closed
  }
}

function connect(cookie: string | null, { origin = ORIGIN as string | null, target = url } = {}): Promise<Client> {
  const headers: Record<string, string> = {}
  if (cookie) headers.cookie = cookie
  if (origin) headers.origin = origin
  const ws = new WebSocket(target, { headers })
  const client = new Client(ws)
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(client))
    ws.once('unexpected-response', (_request, response) => reject(new Error(`HTTP ${response.statusCode}`)))
    ws.once('error', reject)
  })
}

const topicOf = (stageId: string) => `stage-session:${stageId}`
const revisionOf = (message: Message) => (message.snapshot as { state: { revision: number } }).state.revision
const isSnapshot = (topic: string) => (m: Message) => m.type === 'snapshot' && m.topic === topic
const isPresence = (topic: string) => (m: Message) => m.type === 'presence' && m.topic === topic

describe('realtime', () => {
  let ana: User // owner e MD
  let bruno: User // membro da organização da Ana
  let carla: User // outra organização
  let dani: User // sem vínculo
  let orgId: string
  let stageId: string
  let topic: string

  before(async () => {
    ana = await createUser('ana.rt@teste.local')
    bruno = await createUser('bruno.rt@teste.local')
    carla = await createUser('carla.rt@teste.local')
    dani = await createUser('dani.rt@teste.local')
    orgId = await createOrganization(ana, 'Igreja da Ana')
    await createOrganization(carla, 'Igreja da Carla')
    await pool.query(`insert into public.organization_memberships (organization_id, user_id, role) values ($1, $2, 'member')`, [orgId, bruno.id])
    stageId = await createLiveStage(ana, orgId)
    topic = topicOf(stageId)
  })

  test('RT-03: handshake sem cookie, com sessão revogada ou expirada fecha com 4401', async () => {
    const revoked = await newSession(bruno.id)
    await pool.query(`update app.sessions set revoked_at = now() where token_hash = $1`, [tokenHash(revoked.split('=')[1])])
    for (const cookie of [null, revoked, await newSession(bruno.id, true)]) {
      const client = await connect(cookie)
      assert.equal((await client.closed).code, 4401)
    }
  })

  test('RT-04: Origin ausente ou diferente recebe HTTP 403 sem upgrade', async () => {
    await assert.rejects(connect(bruno.cookie, { origin: null }), /HTTP 403/)
    await assert.rejects(connect(bruno.cookie, { origin: 'https://malicioso.example' }), /HTTP 403/)
  })

  test('RT-05: subscribe de membro recebe snapshot com a revision atual e depois presence', async () => {
    const client = await connect(bruno.cookie)
    const { snapshot, presence } = await client.subscribe(topic)
    const { rows } = await pool.query('select revision from public.stage_session_states where stage_session_id = $1', [stageId])
    assert.equal(revisionOf(snapshot), rows[0].revision)
    assert.equal((snapshot.snapshot as { session: { md_user_id: string } }).session.md_user_id, ana.id)
    assert.deepEqual(presence.participants, [])
    // Repetir é idempotente: reenvia os dois.
    await client.subscribe(topic)
    await client.close()
  })

  test('RT-06: outra organização, sem vínculo e sessão inexistente recebem o mesmo forbidden', async () => {
    const errors = []
    for (const [user, target] of [[carla, topic], [dani, topic], [bruno, topicOf(crypto.randomUUID())]] as const) {
      const client = await connect(user.cookie)
      client.send({ type: 'subscribe', topic: target })
      const error = await client.next()
      assert.equal(error.type, 'error')
      errors.push({ code: error.code, message: error.message })
      await client.nothing((m) => m.type === 'snapshot')
      await client.close()
    }
    assert.deepEqual(errors[0], { code: 'forbidden', message: errors[0].message })
    assert.deepEqual(errors[1], errors[0])
    assert.deepEqual(errors[2], errors[0])
  })

  test('RT-07: comando do MD chega a todos; o de um não-MD dá 400 e ninguém recebe nada', async () => {
    const md = await connect(ana.cookie)
    const musician = await connect(bruno.cookie)
    const before = revisionOf((await md.subscribe(topic)).snapshot)
    await musician.subscribe(topic)

    const denied = await rpc(bruno, 'target_stage_next', { p_stage_session_id: stageId })
    assert.equal(denied.statusCode, 400)
    await musician.nothing(isSnapshot(topic))
    await md.nothing(isSnapshot(topic))

    const ok = await rpc(ana, 'target_stage_next', { p_stage_session_id: stageId })
    assert.equal(ok.statusCode, 200, ok.body)
    for (const client of [md, musician]) assert.equal(revisionOf(await client.next(isSnapshot(topic))), before + 1)
    await md.close()
    await musician.close()
  })

  test('RT-08: NOTIFY leva só stage_session_id e revision; UPDATE sem mudar a revision não notifica', async () => {
    const listener = new pg.Client({ database: DB })
    await listener.connect()
    const payloads: unknown[] = []
    listener.on('notification', (n) => payloads.push(JSON.parse(n.payload ?? 'null')))
    await listener.query('listen stage_state_changed')

    const { rows } = await pool.query('select revision from public.stage_session_states where stage_session_id = $1', [stageId])
    await rpc(ana, 'target_stage_set_annotation', { p_stage_session_id: stageId, p_annotation: 'RT-08' })
    await sleep(QUIET_MS)
    assert.deepEqual(payloads, [{ stage_session_id: stageId, revision: rows[0].revision + 1 }])

    await pool.query('update public.stage_session_states set updated_at = now() where stage_session_id = $1', [stageId])
    await sleep(QUIET_MS)
    assert.equal(payloads.length, 1)
    await listener.end()
  })

  test('RT-09: comandos em sequência rápida chegam com revision estritamente crescente', async () => {
    const clients = [await connect(ana.cookie), await connect(bruno.cookie)]
    const start = []
    for (const client of clients) start.push(revisionOf((await client.subscribe(topic)).snapshot))
    await Promise.all(Array.from({ length: 8 }, (_, i) => rpc(ana, 'target_stage_set_annotation', { p_stage_session_id: stageId, p_annotation: `n${i}` })))
    const { rows } = await pool.query<{ revision: number }>('select revision from public.stage_session_states where stage_session_id = $1', [stageId])
    for (const [index, client] of clients.entries()) {
      let last = start[index]
      while (last < rows[0].revision) {
        const revision = revisionOf(await client.next(isSnapshot(topic)))
        assert.ok(revision > last, `revision ${revision} depois de ${last}`)
        last = revision
      }
      await client.close()
    }
  })

  test('RT-10: presence usa o userId da sessão e normaliza os campos', async () => {
    const md = await connect(ana.cookie)
    const musician = await connect(bruno.cookie)
    await md.subscribe(topic)
    await musician.subscribe(topic)
    musician.send({ type: 'presence', topic, userId: ana.id, isMd: true, displayName: 'Ana (falsa)', musicalRole: 'kazoo', readiness: 'pronto' })
    const presence = await md.next(isPresence(topic))
    assert.deepEqual(presence.participants, [{ userId: bruno.id, displayName: 'bruno.rt', musicalRole: 'other', readiness: 'waiting' }])

    musician.send({ type: 'presence', topic, displayName: 'Bruno', musicalRole: 'bass', readiness: 'ready' })
    const valid = await md.next(isPresence(topic))
    assert.deepEqual(valid.participants, [{ userId: bruno.id, displayName: 'bruno.rt', musicalRole: 'bass', readiness: 'ready' }])
    await md.close()
    await musician.close()
  })

  test('RT-11: conexões do mesmo usuário viram uma entrada; sai quando a última fecha', async () => {
    const md = await connect(ana.cookie)
    await md.subscribe(topic)
    const first = await connect(bruno.cookie)
    const second = await connect(await newSession(bruno.id))
    await first.subscribe(topic)
    await second.subscribe(topic)
    first.send({ type: 'presence', topic, musicalRole: 'bass', readiness: 'waiting' })
    await md.next(isPresence(topic))
    second.send({ type: 'presence', topic, musicalRole: 'drums', readiness: 'ready' })
    assert.deepEqual((await md.next(isPresence(topic))).participants, [{ userId: bruno.id, displayName: 'bruno.rt', musicalRole: 'drums', readiness: 'ready' }])

    await second.close()
    assert.deepEqual((await md.next(isPresence(topic))).participants, [{ userId: bruno.id, displayName: 'bruno.rt', musicalRole: 'bass', readiness: 'waiting' }])
    await first.close()
    assert.deepEqual((await md.next(isPresence(topic))).participants, [])
    await md.close()
  })

  test('RT-12: unsubscribe tira a presença; presence sem subscribe dá not_subscribed', async () => {
    const md = await connect(ana.cookie)
    const musician = await connect(bruno.cookie)
    await md.subscribe(topic)
    await musician.subscribe(topic)
    musician.send({ type: 'presence', topic, musicalRole: 'keys', readiness: 'ready' })
    assert.equal(((await md.next(isPresence(topic))).participants as unknown[]).length, 1)
    musician.send({ type: 'unsubscribe', topic })
    assert.deepEqual((await md.next(isPresence(topic))).participants, [])

    musician.send({ type: 'presence', topic, musicalRole: 'keys', readiness: 'ready' })
    const error = await musician.next((m) => m.type === 'error')
    assert.equal(error.code, 'not_subscribed')
    assert.equal(error.topic, topic)
    await md.close()
    await musician.close()
  })

  test('RT-13: limites de tamanho, tópicos, mensagens, conexões e JSON inválido', async () => {
    const big = await connect(bruno.cookie)
    big.send('x'.repeat(5000))
    assert.equal((await big.closed).code, 1009)

    const extra = []
    for (let i = 0; i < 4; i += 1) extra.push(topicOf(await createLiveStage(ana, orgId)))
    const many = await connect(bruno.cookie)
    for (const t of extra) await many.subscribe(t)
    many.send({ type: 'subscribe', topic })
    assert.equal((await many.next((m) => m.type === 'error')).code, 'too_many_topics')

    many.send('{não é json')
    assert.equal((await many.next((m) => m.type === 'error')).code, 'invalid_message')
    many.send({ type: 'publish', topic })
    assert.equal((await many.next((m) => m.type === 'error')).code, 'invalid_message')
    many.send({ type: 'subscribe', topic: 'band-stage:1' })
    assert.equal((await many.next((m) => m.type === 'error')).code, 'invalid_topic')
    many.send({ type: 'ping' })
    await many.next((m) => m.type === 'pong')
    await many.close()

    const flood = await connect(bruno.cookie)
    for (let i = 0; i < 31; i += 1) flood.send({ type: 'ping' })
    assert.equal((await flood.closed).code, 1008)

    const open = []
    for (let i = 0; i < 10; i += 1) open.push(await connect(dani.cookie))
    const eleventh = await connect(dani.cookie)
    assert.equal((await eleventh.closed).code, 4429)
    await Promise.all(open.map((client) => client.close()))
  })

  test('RT-14: ping recebe pong; silêncio além do timeout encerra a conexão e limpa a presença', async () => {
    // App com timeout de 300 ms; o observador manda ping para não cair.
    const watcher = await connect(ana.cookie, { target: idleUrl })
    const keepAlive = setInterval(() => watcher.send({ type: 'ping' }), 100)
    try {
      await watcher.subscribe(topic)
      const silent = await connect(bruno.cookie, { target: idleUrl })
      silent.send({ type: 'ping' })
      await silent.next((m) => m.type === 'pong')
      silent.send({ type: 'subscribe', topic })
      silent.send({ type: 'presence', topic, musicalRole: 'bass', readiness: 'ready' })
      await watcher.next((m) => isPresence(topic)(m) && (m.participants as unknown[]).length === 1)
      assert.equal((await silent.closed).code, 1001)
      assert.deepEqual((await watcher.next(isPresence(topic))).participants, [])
    } finally {
      clearInterval(keepAlive)
      await watcher.close()
    }
  })

  test('RT-15: logout e reset derrubam com 4401; membership removida gera forbidden', async () => {
    const cookie = await newSession(bruno.id)
    const loggedOut = await connect(cookie)
    await loggedOut.subscribe(topic)
    const logout = await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie, origin: ORIGIN } })
    assert.equal(logout.statusCode, 204)
    assert.equal((await loggedOut.closed).code, 4401)

    const reset = await connect(await newSession(bruno.id))
    // O mesmo UPDATE do /auth/password-reset/confirm.
    await pool.query('update app.sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [bruno.id])
    assert.equal((await reset.closed).code, 4401)
    bruno.cookie = await newSession(bruno.id)

    const md = await connect(ana.cookie)
    const removed = await connect(bruno.cookie)
    await md.subscribe(topic)
    await removed.subscribe(topic)
    removed.send({ type: 'presence', topic, musicalRole: 'bass', readiness: 'ready' })
    await md.next((m) => isPresence(topic)(m) && (m.participants as unknown[]).length === 1)
    await pool.query('delete from public.organization_memberships where organization_id = $1 and user_id = $2', [orgId, bruno.id])
    try {
      const error = await removed.next((m) => m.type === 'error')
      assert.equal(error.code, 'forbidden')
      assert.equal(error.topic, topic)
      assert.deepEqual((await md.next(isPresence(topic))).participants, [])
      await rpc(ana, 'target_stage_set_annotation', { p_stage_session_id: stageId, p_annotation: 'RT-15' })
      await md.next(isSnapshot(topic))
      await removed.nothing(isSnapshot(topic))
    } finally {
      await pool.query(`insert into public.organization_memberships (organization_id, user_id, role) values ($1, $2, 'member')`, [orgId, bruno.id])
      await md.close()
      await removed.close()
    }
  })

  test('RT-16: queda do LISTEN com comando no meio; após reconectar, o snapshot novo chega', async () => {
    const musician = await connect(bruno.cookie)
    const before = revisionOf((await musician.subscribe(topic)).snapshot)
    const { rows } = await pool.query(
      `select pg_terminate_backend(pid) as ok from pg_stat_activity where datname = $1 and application_name = 'cantum-realtime-listener' and pid <> pg_backend_pid()`,
      [DB],
    )
    assert.ok(rows.length >= 1 && rows.every((row) => row.ok))
    const ok = await rpc(ana, 'target_stage_set_annotation', { p_stage_session_id: stageId, p_annotation: 'RT-16' })
    assert.equal(ok.statusCode, 200, ok.body)
    assert.equal(revisionOf(await musician.next(isSnapshot(topic), 5000)), before + 1)
    await musician.close()
  })

  test('RT-17: subscribe seguido de presence sem esperar é processado em ordem', async () => {
    const md = await connect(ana.cookie)
    await md.subscribe(topic)
    const musician = await connect(bruno.cookie)
    musician.send({ type: 'subscribe', topic })
    musician.send({ type: 'presence', topic, musicalRole: 'vocals', readiness: 'ready' })
    assert.equal((await musician.next()).type, 'snapshot')
    assert.deepEqual((await musician.next()).participants, [])
    const own = await musician.next()
    assert.equal(own.type, 'presence')
    assert.deepEqual(own.participants, [{ userId: bruno.id, displayName: 'bruno.rt', musicalRole: 'vocals', readiness: 'ready' }])
    assert.equal(musician.inbox.filter((m) => m.type === 'error').length, 0)
    await md.close()
    await musician.close()
  })
})
