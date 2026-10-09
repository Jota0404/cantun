// Integração contra PostgreSQL real: banco descartável criado com scripts/db/migrate.sh.
// Requer psql no PATH e as variáveis PG* (as mesmas do scripts/db/verify-migrations.sh).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { after, before, describe, test } from 'node:test'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.ts'
import { hashPassword, verifyPassword } from './auth.ts'
import { createPool } from './db.ts'
import type { Pool } from './db.ts'
import type { Mail } from './mailer.ts'

const DB = 'cantum_server_test'
const ORIGIN = 'http://localhost:5173'
const migrate = fileURLToPath(new URL('../../scripts/db/migrate.sh', import.meta.url))

let app: FastifyInstance
let pool: Pool
const mails: Mail[] = []

before(async () => {
  execFileSync('psql', ['-X', '-q', '-d', 'postgres', '-c', `drop database if exists ${DB}`, '-c', `create database ${DB}`])
  execFileSync(migrate, [DB])
  pool = createPool({ database: DB })
  app = await buildApp({ pool, appOrigin: ORIGIN, logger: false, mailer: { send: async (mail) => void mails.push(mail) } })
})

after(async () => {
  await app.close()
  await pool.end()
})

function cookieOf(response: { headers: Record<string, unknown> }): string {
  const header = String(response.headers['set-cookie'] ?? '')
  return header.split(';')[0]
}

function tokenFrom(mail: Mail | undefined): string {
  assert.ok(mail, 'e-mail não enviado')
  return new URL(mail.link).searchParams.get('token') ?? ''
}

async function signup(email: string, password = 'senha-forte-123') {
  const response = await app.inject({ method: 'POST', url: '/auth/signup', payload: { email, password } })
  assert.equal(response.statusCode, 201, response.body)
  return { cookie: cookieOf(response), user: response.json().user as { id: string; email: string; emailVerified: boolean } }
}

test('hash de senha: formato scrypt e verificação', async () => {
  const hash = await hashPassword('correta-123')
  assert.match(hash, /^scrypt\$131072\$8\$1\$/)
  assert.equal(await verifyPassword('correta-123', hash), true)
  assert.equal(await verifyPassword('errada-123', hash), false)
})

describe('autenticação', () => {
  test('cadastro cria sessão em cookie HttpOnly e envia verificação', async () => {
    const response = await app.inject({ method: 'POST', url: '/auth/signup', payload: { email: 'Ana@Teste.Local', password: 'senha-forte-123' } })
    assert.equal(response.statusCode, 201)
    const setCookie = String(response.headers['set-cookie'])
    assert.match(setCookie, /cantum_session=/)
    assert.match(setCookie, /HttpOnly/)
    assert.match(setCookie, /SameSite=Lax/)
    assert.equal(response.json().user.email, 'ana@teste.local')
    assert.equal(response.json().user.emailVerified, false)

    const session = await app.inject({ method: 'GET', url: '/auth/session', headers: { cookie: cookieOf(response) } })
    assert.equal(session.statusCode, 200)

    const verify = await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { token: tokenFrom(mails.at(-1)) } })
    assert.equal(verify.statusCode, 204)
    const after = await app.inject({ method: 'GET', url: '/auth/session', headers: { cookie: cookieOf(response) } })
    assert.equal(after.json().user.emailVerified, true)

    const reuse = await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { token: tokenFrom(mails.at(-1)) } })
    assert.equal(reuse.statusCode, 400)
  })

  test('e-mail duplicado, senha curta e login inválido são recusados', async () => {
    assert.equal((await app.inject({ method: 'POST', url: '/auth/signup', payload: { email: 'ana@teste.local', password: 'outra-senha-123' } })).statusCode, 409)
    assert.equal((await app.inject({ method: 'POST', url: '/auth/signup', payload: { email: 'curta@teste.local', password: '123' } })).statusCode, 400)
    const wrong = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'ana@teste.local', password: 'errada-123' } })
    assert.equal(wrong.statusCode, 401)
    const unknown = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'ninguem@teste.local', password: 'qualquer-123' } })
    assert.equal(unknown.statusCode, 401)
    assert.equal(wrong.json().error, unknown.json().error)
  })

  test('logout revoga a sessão', async () => {
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'ana@teste.local', password: 'senha-forte-123' } })
    assert.equal(login.statusCode, 200)
    const cookie = cookieOf(login)
    assert.equal((await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie } })).statusCode, 204)
    assert.equal((await app.inject({ method: 'GET', url: '/auth/session', headers: { cookie } })).statusCode, 401)
  })

  test('redefinição de senha troca a senha e derruba as sessões', async () => {
    const { cookie } = await signup('reset@teste.local', 'senha-antiga-123')
    const request = await app.inject({ method: 'POST', url: '/auth/password-reset/request', payload: { email: 'reset@teste.local' } })
    assert.equal(request.statusCode, 204)
    const silent = await app.inject({ method: 'POST', url: '/auth/password-reset/request', payload: { email: 'naoexiste@teste.local' } })
    assert.equal(silent.statusCode, 204)

    const confirm = await app.inject({ method: 'POST', url: '/auth/password-reset/confirm', payload: { token: tokenFrom(mails.at(-1)), password: 'senha-nova-123' } })
    assert.equal(confirm.statusCode, 204)
    assert.equal((await app.inject({ method: 'GET', url: '/auth/session', headers: { cookie } })).statusCode, 401)
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'reset@teste.local', password: 'senha-nova-123' } })
    assert.equal(login.statusCode, 200)
  })

  test('reenvio da verificação: exige sessão, respeita o cooldown, invalida o link anterior e não reenvia se já verificado', async () => {
    assert.equal((await app.inject({ method: 'POST', url: '/auth/verify-email/resend' })).statusCode, 401)

    const { cookie, user } = await signup('reenvio@teste.local')
    const first = tokenFrom(mails.at(-1))
    const sent = mails.length
    // Cooldown de 60 s por usuário: o e-mail do cadastro conta; o relógio anda pelo banco.
    const resend = () => app.inject({ method: 'POST', url: '/auth/verify-email/resend', headers: { cookie } })
    const age = () => pool.query(`update app.email_tokens set created_at = created_at - interval '61 seconds' where user_id = $1`, [user.id])
    assert.equal((await resend()).statusCode, 204)
    assert.equal(mails.length, sent)
    await age()
    assert.equal((await resend()).statusCode, 204)
    assert.equal(mails.length, sent + 1)
    assert.equal((await resend()).statusCode, 204)
    assert.equal(mails.length, sent + 1)
    assert.equal(mails.at(-1)?.to, 'reenvio@teste.local')
    assert.equal(mails.at(-1)?.purpose, 'verify_email')
    const second = tokenFrom(mails.at(-1))

    assert.equal((await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { token: first } })).statusCode, 400)
    assert.equal((await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { token: second } })).statusCode, 204)

    await age()
    assert.equal((await resend()).statusCode, 204)
    assert.equal(mails.length, sent + 1)
  })

  test('reenvios simultâneos geram um e-mail e um só link válido', async () => {
    const { cookie, user } = await signup('reenvio.concorrente@teste.local')
    await pool.query(`update app.email_tokens set created_at = created_at - interval '61 seconds' where user_id = $1`, [user.id])
    const sent = mails.length
    // Segura a escrita em email_tokens para que os quatro reenvios se sobreponham de fato.
    const lock = await pool.connect()
    await lock.query('begin')
    await lock.query('lock table app.email_tokens in exclusive mode')
    const pending = Promise.all(Array.from({ length: 4 }, () => app.inject({ method: 'POST', url: '/auth/verify-email/resend', headers: { cookie } })))
    await new Promise((resolve) => setTimeout(resolve, 200))
    await lock.query('commit')
    lock.release()
    const responses = await pending
    assert.deepEqual(responses.map((r) => r.statusCode), [204, 204, 204, 204])
    assert.equal(mails.length, sent + 1)
    const { rows } = await pool.query(`select count(*)::int as valid from app.email_tokens where user_id = $1 and purpose = 'verify_email' and used_at is null`, [user.id])
    assert.equal(rows[0].valid, 1)
  })

  test('escrita vinda de outra origem é bloqueada', async () => {
    const response = await app.inject({ method: 'POST', url: '/auth/logout', headers: { origin: 'https://malicioso.example' } })
    assert.equal(response.statusCode, 403)
  })
})

describe('dados sob RLS', () => {
  let ana: string
  let bruno: string
  const orgId = '20000000-0000-0000-0000-0000000000a1'

  before(async () => {
    ana = (await signup('ana.dados@teste.local')).cookie
    bruno = (await signup('bruno.dados@teste.local')).cookie
  })

  test('sem sessão: 401; função fora da allowlist: 404', async () => {
    assert.equal((await app.inject({ method: 'POST', url: '/rpc/create_organization', payload: {} })).statusCode, 401)
    assert.equal((await app.inject({ method: 'GET', url: '/sync/organizations' })).statusCode, 401)
    const hidden = await app.inject({ method: 'POST', url: '/rpc/initialize_target_stage_state', headers: { cookie: ana }, payload: {} })
    assert.equal(hidden.statusCode, 404)
    const unknownTable = await app.inject({ method: 'GET', url: '/sync/schema_migrations', headers: { cookie: ana } })
    assert.equal(unknownTable.statusCode, 404)
  })

  test('RPC devolve a linha e traduz erros do banco', async () => {
    const created = await app.inject({ method: 'POST', url: '/rpc/create_organization', headers: { cookie: ana }, payload: { p_id: orgId, p_name: 'Igreja da Ana' } })
    assert.equal(created.statusCode, 200, created.body)
    assert.equal(created.json().name, 'Igreja da Ana')

    const invalid = await app.inject({ method: 'POST', url: '/rpc/create_organization', headers: { cookie: ana }, payload: { p_id: crypto.randomUUID(), p_name: ' ' } })
    assert.equal(invalid.statusCode, 400)
    assert.equal(invalid.json().error, 'organization name is required')

    const badArg = await app.inject({ method: 'POST', url: '/rpc/create_organization', headers: { cookie: ana }, payload: { p_id: orgId, drop: 'x' } })
    assert.equal(badArg.statusCode, 400)
  })

  test('cada usuário só lê e escreve o que a RLS permite', async () => {
    assert.equal((await app.inject({ method: 'GET', url: '/sync/organizations', headers: { cookie: ana } })).json().length, 1)
    assert.equal((await app.inject({ method: 'GET', url: '/sync/organizations', headers: { cookie: bruno } })).json().length, 0)

    const anaId = (await app.inject({ method: 'GET', url: '/auth/session', headers: { cookie: ana } })).json().user.id
    const song = {
      user_id: anaId, id: crypto.randomUUID(), title: 'Música da Ana', original_key: 'C', current_key: 'C',
      lyrics: 'C G Am F', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    const upsert = await app.inject({ method: 'POST', url: '/sync/songs', headers: { cookie: ana }, payload: { rows: [song] } })
    assert.equal(upsert.statusCode, 200, upsert.body)
    assert.equal(upsert.json().count, 1)

    const again = await app.inject({ method: 'POST', url: '/sync/songs', headers: { cookie: ana }, payload: { rows: [{ ...song, title: 'Editada' }] } })
    assert.equal(again.json().count, 1)
    const read = await app.inject({ method: 'GET', url: `/sync/songs?id=${song.id}`, headers: { cookie: ana } })
    assert.equal(read.json()[0].title, 'Editada')

    assert.equal((await app.inject({ method: 'GET', url: '/sync/songs', headers: { cookie: bruno } })).json().length, 0)
    const forged = await app.inject({ method: 'POST', url: '/sync/songs', headers: { cookie: bruno }, payload: { rows: [{ ...song, id: crypto.randomUUID() }] } })
    assert.equal(forged.statusCode, 403)

    const patch = await app.inject({ method: 'PATCH', url: `/sync/songs?id=${song.id}`, headers: { cookie: bruno }, payload: { values: { title: 'Invadida' } } })
    assert.equal(patch.json().count, 0)
    const remove = await app.inject({ method: 'DELETE', url: `/sync/songs?id=${song.id}`, headers: { cookie: bruno } })
    assert.equal(remove.json().count, 0)

    const unfiltered = await app.inject({ method: 'DELETE', url: '/sync/songs', headers: { cookie: ana } })
    assert.equal(unfiltered.statusCode, 400)
    const badColumn = await app.inject({ method: 'GET', url: '/sync/songs?senha=1', headers: { cookie: ana } })
    assert.equal(badColumn.statusCode, 400)
  })
  test('Stage só muda por RPC: /sync recusa gravar em stage_sessions e stage_session_states', async () => {
    const anaId = (await app.inject({ method: 'GET', url: '/auth/session', headers: { cookie: ana } })).json().user.id
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const writes = [
      { table: 'stage_sessions', row: { id, service_id: crypto.randomUUID(), status: 'live', md_user_id: anaId, created_at: now, updated_at: now } },
      { table: 'stage_session_states', row: { stage_session_id: id, revision: 999999, current_index: 0, is_running: true, updated_at: now } },
    ]
    for (const { table, row } of writes) {
      const insert = await app.inject({ method: 'POST', url: `/sync/${table}`, headers: { cookie: ana }, payload: { rows: [row] } })
      assert.equal(insert.statusCode, 403, `${table}: ${insert.body}`)
      const key = table === 'stage_sessions' ? 'id' : 'stage_session_id'
      const patch = await app.inject({ method: 'PATCH', url: `/sync/${table}?${key}=${id}`, headers: { cookie: ana }, payload: { values: { updated_at: now } } })
      assert.equal(patch.statusCode, 403, `${table}: ${patch.body}`)
      const remove = await app.inject({ method: 'DELETE', url: `/sync/${table}?${key}=${id}`, headers: { cookie: ana } })
      assert.equal(remove.statusCode, 403, `${table}: ${remove.body}`)
    }
  })
})
