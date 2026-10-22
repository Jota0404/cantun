// Integração contra PostgreSQL real: banco descartável criado com o migrador em Node
// (src/migrate.ts, o mesmo do deploy). Requer psql no PATH e as variáveis PG* (as mesmas
// do scripts/db/verify-migrations.sh).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { after, before, describe, test } from 'node:test'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.ts'
import { hashPassword, newToken, verifyPassword } from './auth.ts'
import { createPool } from './db.ts'
import type { Pool } from './db.ts'
import type { Mail } from './mailer.ts'
import { brevoMailer } from './mailer.ts'
import { inviteHook } from './schedule.ts'
import { migrate } from './migrate.ts'

const DB = 'cantum_server_test'
const ORIGIN = 'http://localhost:5173'
const CONSENT_VERSION = '2026-10-17'

let app: FastifyInstance
let pool: Pool
const mails: Mail[] = []

before(async () => {
  execFileSync('psql', ['-X', '-q', '-d', 'postgres', '-c', `drop database if exists ${DB}`, '-c', `create database ${DB}`])
  assert.ok((await migrate({ database: DB })).includes('0001_baseline'))
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

async function signup(email: string, password = 'senha-forte-123', displayName = 'Pessoa Teste') {
  const response = await app.inject({ method: 'POST', url: '/auth/signup', payload: { consentVersion: CONSENT_VERSION, ageDeclared: true, email, password, displayName } })
  assert.equal(response.statusCode, 201, response.body)
  return { cookie: cookieOf(response), user: response.json().user as { id: string; email: string; emailVerified: boolean; displayName: string } }
}

test('hash de senha: formato scrypt e verificação', async () => {
  const hash = await hashPassword('correta-123')
  assert.match(hash, /^scrypt\$131072\$8\$1\$/)
  assert.equal(await verifyPassword('correta-123', hash), true)
  assert.equal(await verifyPassword('errada-123', hash), false)
})

describe('autenticação', () => {
  test('cadastro cria sessão em cookie HttpOnly e envia verificação', async () => {
    const response = await app.inject({ method: 'POST', url: '/auth/signup', payload: { consentVersion: CONSENT_VERSION, ageDeclared: true, email: 'Ana@Teste.Local', password: 'senha-forte-123', displayName: '  Ana Souza ' } })
    assert.equal(response.statusCode, 201)
    const setCookie = String(response.headers['set-cookie'])
    assert.match(setCookie, /cantum_session=/)
    assert.match(setCookie, /HttpOnly/)
    assert.match(setCookie, /SameSite=Lax/)
    assert.equal(response.json().user.email, 'ana@teste.local')
    assert.equal(response.json().user.emailVerified, false)

    assert.equal(response.json().user.displayName, 'Ana Souza')
    const session = await app.inject({ method: 'GET', url: '/auth/session', headers: { cookie: cookieOf(response) } })
    assert.equal(session.statusCode, 200)
    assert.equal(session.json().user.displayName, 'Ana Souza')

    const verify = await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { token: tokenFrom(mails.at(-1)) } })
    assert.equal(verify.statusCode, 204)
    const after = await app.inject({ method: 'GET', url: '/auth/session', headers: { cookie: cookieOf(response) } })
    assert.equal(after.json().user.emailVerified, true)

    const reuse = await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { token: tokenFrom(mails.at(-1)) } })
    assert.equal(reuse.statusCode, 400)
  })

  test('e-mail duplicado, senha curta e login inválido são recusados', async () => {
    assert.equal((await app.inject({ method: 'POST', url: '/auth/signup', payload: { consentVersion: CONSENT_VERSION, ageDeclared: true, email: 'ana@teste.local', password: 'outra-senha-123', displayName: 'Ana' } })).statusCode, 409)
    assert.equal((await app.inject({ method: 'POST', url: '/auth/signup', payload: { consentVersion: CONSENT_VERSION, ageDeclared: true, email: 'curta@teste.local', password: '123', displayName: 'Curta' } })).statusCode, 400)
    const wrong = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'ana@teste.local', password: 'errada-123' } })
    assert.equal(wrong.statusCode, 401)
    const unknown = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'ninguem@teste.local', password: 'qualquer-123' } })
    assert.equal(unknown.statusCode, 401)
    assert.equal(wrong.json().error, unknown.json().error)
  })

  test('cadastro exige nome de exibição com 1 a 80 caracteres', async () => {
    // IP próprio: não consome o limite de cadastro dos outros testes.
    for (const displayName of [undefined, '', '   ', 'x'.repeat(81)]) {
      const response = await app.inject({ method: 'POST', url: '/auth/signup', remoteAddress: '10.0.0.80', payload: { consentVersion: CONSENT_VERSION, ageDeclared: true, email: 'sem.nome@teste.local', password: 'senha-forte-123', displayName } })
      assert.equal(response.statusCode, 400, `displayName ${JSON.stringify(displayName)}`)
    }
    const login = await app.inject({ method: 'POST', url: '/auth/login', remoteAddress: '10.0.0.80', payload: { email: 'sem.nome@teste.local', password: 'senha-forte-123' } })
    assert.equal(login.statusCode, 401)
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
    const mailsBefore = mails.length
    const placeholder = await app.inject({ method: 'POST', url: '/auth/password-reset/request', payload: { email: 'deleted@invalid' } })
    // Só formato: `deleted@invalid` já leva 400 na validação. A proteção do sentinela é o check do banco (db/tests/0013).
    assert.equal(placeholder.statusCode, 400)
    assert.equal(mails.length, mailsBefore, 'sentinela não recebe e-mail de redefinição')

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

  test('nome de exibição: set_my_display_name e perfis da organização sem e-mail', async () => {
    const renamed = await app.inject({ method: 'POST', url: '/rpc/set_my_display_name', headers: { cookie: bruno }, payload: { p_display_name: ' Bruno Lima ' } })
    assert.equal(renamed.statusCode, 200, renamed.body)
    assert.equal(renamed.json(), 'Bruno Lima')
    assert.equal((await app.inject({ method: 'GET', url: '/auth/session', headers: { cookie: bruno } })).json().user.displayName, 'Bruno Lima')
    const empty = await app.inject({ method: 'POST', url: '/rpc/set_my_display_name', headers: { cookie: bruno }, payload: { p_display_name: ' ' } })
    assert.equal(empty.statusCode, 400)

    const profiles = await app.inject({ method: 'POST', url: '/rpc/get_organization_member_profiles', headers: { cookie: ana }, payload: { p_organization_id: orgId } })
    assert.equal(profiles.statusCode, 200, profiles.body)
    assert.equal(profiles.json().length, 1)
    assert.deepEqual(Object.keys(profiles.json()[0]).sort(), ['display_name', 'user_id'])
    const outsider = await app.inject({ method: 'POST', url: '/rpc/get_organization_member_profiles', headers: { cookie: bruno }, payload: { p_organization_id: orgId } })
    assert.deepEqual(outsider.json(), [])
  })

  test('serviço: itens renumerados num lote do /sync; status só por RPC', async () => {
    const anaId = (await app.inject({ method: 'GET', url: '/auth/session', headers: { cookie: ana } })).json().user.id
    const teamId = crypto.randomUUID()
    const serviceId = crypto.randomUUID()
    const team = await app.inject({ method: 'POST', url: '/sync/teams', headers: { cookie: ana }, payload: { rows: [{ id: teamId, organization_id: orgId, name: 'Louvor' }] } })
    assert.equal(team.statusCode, 200, team.body)
    const service = { id: serviceId, organization_id: orgId, team_id: teamId, name: 'Culto', starts_at: new Date().toISOString(), created_by_user_id: anaId }
    assert.equal((await app.inject({ method: 'POST', url: '/sync/services', headers: { cookie: ana }, payload: { rows: [service] } })).statusCode, 200)

    const opening = { id: crypto.randomUUID(), service_id: serviceId, type: 'opening', title: 'Abertura', position: 0 }
    const prayer = { id: crypto.randomUUID(), service_id: serviceId, type: 'prayer', title: 'Oração', position: 1 }
    assert.equal((await app.inject({ method: 'POST', url: '/sync/service_items', headers: { cookie: ana }, payload: { rows: [opening, prayer] } })).statusCode, 200)
    const swapped = await app.inject({ method: 'POST', url: '/sync/service_items', headers: { cookie: ana }, payload: { rows: [{ ...opening, position: 1 }, { ...prayer, position: 0 }] } })
    assert.equal(swapped.statusCode, 200, swapped.body)
    const items = await app.inject({ method: 'GET', url: `/sync/service_items?service_id=${serviceId}`, headers: { cookie: ana } })
    assert.deepEqual(items.json().map((item: { type: string; position: number }) => [item.type, item.position]).sort((a: [string, number], b: [string, number]) => a[1] - b[1]), [['prayer', 0], ['opening', 1]])

    const personalId = crypto.randomUUID()
    const songRow = { user_id: anaId, id: personalId, title: 'Rocha', original_key: 'C', current_key: 'C', lyrics: 'x', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    assert.equal((await app.inject({ method: 'POST', url: '/sync/songs', headers: { cookie: ana }, payload: { rows: [songRow] } })).statusCode, 200)
    const songId = (await app.inject({ method: 'POST', url: '/rpc/copy_song_to_organization', headers: { cookie: ana }, payload: { p_song_id: personalId, p_organization_id: orgId } })).json().id
    const songItem = { id: crypto.randomUUID(), service_id: serviceId, type: 'song', song_id: songId, position: 2 }
    assert.equal((await app.inject({ method: 'POST', url: '/sync/service_items', headers: { cookie: ana }, payload: { rows: [{ ...songItem, key: 'Bb' }] } })).statusCode, 200)
    assert.equal((await app.inject({ method: 'GET', url: `/sync/service_items?service_id=${serviceId}`, headers: { cookie: ana } })).json().find((i: { id: string }) => i.id === songItem.id).key, 'Bb')
    assert.notEqual((await app.inject({ method: 'POST', url: '/sync/service_items', headers: { cookie: ana }, payload: { rows: [{ ...songItem, key: 'Am' }] } })).statusCode, 200)

    const withStatus = await app.inject({ method: 'POST', url: '/sync/services', headers: { cookie: ana }, payload: { rows: [{ ...service, status: 'completed' }] } })
    assert.equal(withStatus.statusCode, 403)
    const ready = await app.inject({ method: 'POST', url: '/rpc/transition_service', headers: { cookie: ana }, payload: { p_service_id: serviceId, p_to: 'ready' } })
    assert.equal(ready.statusCode, 200, ready.body)
    assert.equal(ready.json().status, 'ready')
    const invalid = await app.inject({ method: 'POST', url: '/rpc/transition_service', headers: { cookie: ana }, payload: { p_service_id: serviceId, p_to: 'completed' } })
    assert.equal(invalid.statusCode, 400)
    assert.equal(invalid.json().error, 'invalid service transition')
  })
})

describe('músicas do Ministério (ADR-062)', () => {
  test('RPC de cópia, edição da cópia por Líder/Admin sem trocar o autor, upsert negado e pull por Ministério', async () => {
    const ip = { remoteAddress: '10.0.0.93' }
    const join = async (email: string, displayName: string) => {
      const response = await app.inject({ method: 'POST', url: '/auth/signup', ...ip, payload: { consentVersion: CONSENT_VERSION, ageDeclared: true, email, password: 'senha-forte-123', displayName } })
      assert.equal(response.statusCode, 201, response.body)
      return { cookie: cookieOf(response), id: response.json().user.id as string }
    }
    const dona = await join('dona.copia@teste.local', 'Dona')
    const autor = await join('autor.copia@teste.local', 'Autor')
    const lider = await join('lider.copia@teste.local', 'Lider')
    const call = (user: { cookie: string }, name: string, payload: object) => app.inject({ method: 'POST', url: `/rpc/${name}`, headers: { cookie: user.cookie }, payload })
    const orgId = crypto.randomUUID(), otherOrgId = crypto.randomUUID(), teamId = crypto.randomUUID()
    await call(dona, 'create_organization', { p_id: orgId, p_name: 'Ministério A' })
    await call(dona, 'create_organization', { p_id: otherOrgId, p_name: 'Ministério B' })
    await app.inject({ method: 'POST', url: '/sync/teams', headers: { cookie: dona.cookie }, payload: { rows: [{ id: teamId, organization_id: orgId, name: 'Banda' }] } })
    for (const user of [autor, lider]) await pool.query(`insert into public.organization_memberships (organization_id, user_id, role) values ($1, $2, 'member')`, [orgId, user.id])
    await pool.query('insert into public.team_memberships (team_id, user_id) values ($1, $2)', [teamId, autor.id])
    await pool.query(`insert into public.team_memberships (team_id, user_id, role) values ($1, $2, 'leader')`, [teamId, lider.id])

    const personalId = crypto.randomUUID()
    const now = new Date().toISOString()
    const personal = { user_id: autor.id, id: personalId, title: 'Minha', original_key: 'C', current_key: 'C', lyrics: 'C G', created_at: now, updated_at: now }
    assert.equal((await app.inject({ method: 'POST', url: '/sync/songs', headers: { cookie: autor.cookie }, payload: { rows: [personal] } })).statusCode, 200)

    // RPC na allowlist: cria, é idempotente e devolve a linha.
    const copyId = crypto.randomUUID()
    const copied = await call(autor, 'copy_song_to_organization', { p_song_id: personalId, p_organization_id: orgId, p_new_id: copyId })
    assert.equal(copied.statusCode, 200, copied.body)
    assert.deepEqual([copied.json().id, copied.json().user_id, copied.json().organization_id, copied.json().source_song_id], [copyId, autor.id, orgId, personalId])
    const again = await call(autor, 'copy_song_to_organization', { p_song_id: personalId, p_organization_id: orgId })
    assert.equal(again.json().id, copyId)
    const denied = await call(autor, 'copy_song_to_organization', { p_song_id: personalId, p_organization_id: otherOrgId })
    assert.equal(denied.statusCode, 400)
    assert.equal(denied.json().error, 'not authorized to copy songs to this organization')
    assert.equal((await call(lider, 'copy_song_to_organization', { p_song_id: personalId, p_organization_id: orgId })).json().error, 'song not found or not authorized')

    // Repertório pessoal (organization_id nulo) sobe por /sync e a importação está na allowlist do /rpc.
    const personalRepId = crypto.randomUUID(), leaderRepId = crypto.randomUUID()
    const rep = (id: string, userId: string) => ({ id, organization_id: null, name: 'Pessoal', created_by_user_id: userId, version: 1, created_at: now, updated_at: now })
    assert.equal((await app.inject({ method: 'POST', url: '/sync/repertoires', headers: { cookie: autor.cookie }, payload: { rows: [rep(personalRepId, autor.id)] } })).statusCode, 200)
    assert.equal((await app.inject({ method: 'POST', url: '/sync/repertoires', headers: { cookie: lider.cookie }, payload: { rows: [rep(leaderRepId, lider.id)] } })).statusCode, 200)
    const memberImport = await call(autor, 'import_personal_repertoire', { p_repertoire_id: personalRepId, p_organization_id: orgId })
    assert.equal(memberImport.statusCode, 400)
    assert.equal(memberImport.json().error, 'not authorized to import repertoires into this organization')
    const imported = await call(lider, 'import_personal_repertoire', { p_repertoire_id: leaderRepId, p_organization_id: orgId, p_new_id: crypto.randomUUID() })
    assert.equal(imported.statusCode, 200, imported.body)
    assert.deepEqual([imported.json().repertoire.organization_id, imported.json().copied, imported.json().reused], [orgId, 0, 0])
    assert.equal((await call(lider, 'import_personal_repertoire', { p_repertoire_id: personalRepId, p_organization_id: orgId })).json().error, 'repertoire not found or not authorized')

    // Líder (não autor) edita a MESMA linha por PATCH; o autor não muda e nenhuma linha nasce.
    const patch = await app.inject({ method: 'PATCH', url: `/sync/songs?id=${copyId}`, headers: { cookie: lider.cookie }, payload: { values: { title: 'Editada pelo Líder', updated_at: new Date().toISOString() } } })
    assert.deepEqual(patch.json(), { count: 1 })
    const row = (await pool.query('select user_id, title, count(*) over () as n from public.songs where id = $1', [copyId])).rows
    assert.deepEqual(row.map((r) => [r.user_id, r.title, Number(r.n)]), [[autor.id, 'Editada pelo Líder', 1]])
    assert.equal((await pool.query('select title from public.songs where id = $1', [personalId])).rows[0].title, 'Minha')
    // Trocar o autor ou a organização por PATCH é negado.
    assert.equal((await app.inject({ method: 'PATCH', url: `/sync/songs?id=${copyId}`, headers: { cookie: lider.cookie }, payload: { values: { user_id: lider.id } } })).statusCode, 403)
    assert.equal((await app.inject({ method: 'PATCH', url: `/sync/songs?id=${copyId}`, headers: { cookie: lider.cookie }, payload: { values: { organization_id: otherOrgId } } })).statusCode, 403)

    // Upsert com o user_id do editor não cria linha própria.
    const forged = { user_id: lider.id, id: copyId, organization_id: orgId, title: 'x', original_key: 'C', current_key: 'C', lyrics: 'x', created_at: now, updated_at: now }
    assert.equal((await app.inject({ method: 'POST', url: '/sync/songs', headers: { cookie: lider.cookie }, payload: { rows: [forged] } })).statusCode, 403)
    const asPersonal = { ...forged, organization_id: undefined } // sem organização: tenta criar a "pessoal" com o id da cópia
    assert.equal((await app.inject({ method: 'POST', url: '/sync/songs', headers: { cookie: lider.cookie }, payload: { rows: [asPersonal] } })).statusCode, 409)
    assert.equal(Number((await pool.query('select count(*) from public.songs where id = $1', [copyId])).rows[0].count), 1)

    // Pull por Ministério: um GET com organization_id traz as cópias; fora do Ministério, nada.
    const pull = await app.inject({ method: 'GET', url: `/sync/songs?organization_id=${orgId}`, headers: { cookie: lider.cookie } })
    assert.deepEqual(pull.json().map((song: { id: string }) => song.id), [copyId])
    assert.deepEqual((await app.inject({ method: 'GET', url: `/sync/songs?organization_id=${orgId}`, headers: { cookie: dona.cookie } })).json().map((song: { id: string }) => song.id), [copyId])
    const outsider = await join('fora.copia@teste.local', 'Fora')
    assert.deepEqual((await app.inject({ method: 'GET', url: `/sync/songs?organization_id=${orgId}`, headers: { cookie: outsider.cookie } })).json(), [])
    // A pessoal do autor não aparece para o Líder.
    assert.equal((await app.inject({ method: 'GET', url: `/sync/songs?id=${personalId}`, headers: { cookie: lider.cookie } })).json().length, 0)
  })
})

describe('preparação (VS-04-05, RN-15…17)', () => {
  test('/sync de service_preparations: marca a própria, não a de outro; Líder lê todas, membro só a própria', async () => {
    const join = async (email: string) => {
      const response = await app.inject({ method: 'POST', url: '/auth/signup', remoteAddress: '10.0.0.95', payload: { consentVersion: CONSENT_VERSION, ageDeclared: true, email, password: 'senha-forte-123', displayName: 'P' } })
      assert.equal(response.statusCode, 201, response.body)
      return { cookie: cookieOf(response), id: response.json().user.id as string }
    }
    const olga = await join('olga.prep@teste.local')
    const lia = await join('lia.prep@teste.local')
    const mauro = await join('mauro.prep@teste.local')
    const nina = await join('nina.prep@teste.local')
    const orgId = crypto.randomUUID()
    const teamId = crypto.randomUUID()
    const serviceId = crypto.randomUUID()
    assert.equal((await app.inject({ method: 'POST', url: '/rpc/create_organization', headers: { cookie: olga.cookie }, payload: { p_id: orgId, p_name: 'Igreja P' } })).statusCode, 200)
    assert.equal((await app.inject({ method: 'POST', url: '/sync/teams', headers: { cookie: olga.cookie }, payload: { rows: [{ id: teamId, organization_id: orgId, name: 'Louvor' }] } })).statusCode, 200)
    for (const [user, role] of [[lia, 'leader'], [mauro, 'member'], [nina, 'member']] as const) {
      await pool.query(`insert into public.organization_memberships (organization_id, user_id, role) values ($1, $2, 'member')`, [orgId, user.id])
      await pool.query('insert into public.team_memberships (team_id, user_id, role) values ($1, $2, $3)', [teamId, user.id, role])
    }
    const service = { id: serviceId, organization_id: orgId, team_id: teamId, name: 'Culto', starts_at: new Date().toISOString(), created_by_user_id: olga.id }
    assert.equal((await app.inject({ method: 'POST', url: '/sync/services', headers: { cookie: olga.cookie }, payload: { rows: [service] } })).statusCode, 200)

    const push = (user: { cookie: string }, userId: string) => app.inject({ method: 'POST', url: '/sync/service_preparations', headers: { cookie: user.cookie },
      payload: { rows: [{ service_id: serviceId, user_id: userId, prepared_at: '2026-10-22T10:00:00Z', updated_at: '2026-10-22T10:00:00Z' }] } })
    const read = async (user: { cookie: string }) =>
      (await app.inject({ method: 'GET', url: `/sync/service_preparations?service_id=${serviceId}`, headers: { cookie: user.cookie } })).json().map((r: { user_id: string }) => r.user_id).sort()

    for (const user of [mauro, nina]) assert.equal((await push(user, user.id)).statusCode, 200)
    assert.equal((await push(mauro, mauro.id)).statusCode, 200, 'reenvio sem mudança passa')
    assert.equal((await push(mauro, nina.id)).statusCode, 403, 'marcar por outra pessoa')
    assert.equal((await push(lia, mauro.id)).statusCode, 403, 'Líder marca por outro')
    const moved = await app.inject({ method: 'PATCH', url: `/sync/service_preparations?service_id=${serviceId}&user_id=${mauro.id}`, headers: { cookie: mauro.cookie }, payload: { values: { user_id: nina.id } } })
    assert.equal(moved.statusCode, 403, moved.body)

    assert.deepEqual(await read(mauro), [mauro.id])
    assert.deepEqual(await read(lia), [mauro.id, nina.id].sort())
    assert.deepEqual(await read(olga), [mauro.id, nina.id].sort())

    const unmark = await app.inject({ method: 'DELETE', url: `/sync/service_preparations?service_id=${serviceId}&user_id=${nina.id}`, headers: { cookie: mauro.cookie } })
    assert.equal(unmark.json().count, 0, 'membro não desmarca a de outro')
    assert.equal((await app.inject({ method: 'DELETE', url: `/sync/service_preparations?service_id=${serviceId}&user_id=${nina.id}`, headers: { cookie: nina.cookie } })).json().count, 1)
    assert.deepEqual(await read(lia), [mauro.id])
  })
})

describe('ensaio (VS-04-05, RN-19…21)', () => {
  test('/sync de rehearsals e rehearsal_songs: Líder grava, Membro 403, membro ativo lê', async () => {
    const join = async (email: string) => {
      const response = await app.inject({ method: 'POST', url: '/auth/signup', remoteAddress: '10.0.0.96', payload: { consentVersion: CONSENT_VERSION, ageDeclared: true, email, password: 'senha-forte-123', displayName: 'R' } })
      assert.equal(response.statusCode, 201, response.body)
      return { cookie: cookieOf(response), id: response.json().user.id as string }
    }
    const olga = await join('olga.reh@teste.local')
    const lia = await join('lia.reh@teste.local')
    const mauro = await join('mauro.reh@teste.local')
    const orgId = crypto.randomUUID(), teamId = crypto.randomUUID(), serviceId = crypto.randomUUID()
    const songId = crypto.randomUUID(), itemId = crypto.randomUUID(), rehearsalId = crypto.randomUUID()
    assert.equal((await app.inject({ method: 'POST', url: '/rpc/create_organization', headers: { cookie: olga.cookie }, payload: { p_id: orgId, p_name: 'Igreja R' } })).statusCode, 200)
    assert.equal((await app.inject({ method: 'POST', url: '/sync/teams', headers: { cookie: olga.cookie }, payload: { rows: [{ id: teamId, organization_id: orgId, name: 'Louvor' }] } })).statusCode, 200)
    for (const [user, role] of [[lia, 'leader'], [mauro, 'member']] as const) {
      await pool.query(`insert into public.organization_memberships (organization_id, user_id, role) values ($1, $2, 'member')`, [orgId, user.id])
      await pool.query('insert into public.team_memberships (team_id, user_id, role) values ($1, $2, $3)', [teamId, user.id, role])
    }
    await pool.query(`insert into public.songs (user_id, id, organization_id, title, original_key, current_key, lyrics, created_at, updated_at) values ($1, $2, $3, 'Maior', 'C', 'C', 'x', now(), now())`, [olga.id, songId, orgId])
    await pool.query(`insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id) values ($1, $2, $3, 'Culto', now(), $4)`, [serviceId, orgId, teamId, olga.id])
    await pool.query(`insert into public.service_items (id, service_id, type, song_id, position) values ($1, $2, 'song', $3, 0)`, [itemId, serviceId, songId])

    const rehearsal = { id: rehearsalId, organization_id: orgId, service_id: serviceId, starts_at: '2026-10-22T19:00:00Z', location: 'Sala 2', notes: null, created_at: '2026-10-22T10:00:00Z', updated_at: '2026-10-22T10:00:00Z' }
    const push = (user: { cookie: string }, table: string, row: object) =>
      app.inject({ method: 'POST', url: `/sync/${table}`, headers: { cookie: user.cookie }, payload: { rows: [row] } })

    assert.equal((await push(mauro, 'rehearsals', rehearsal)).statusCode, 403, 'Membro cria')
    const created = await push(lia, 'rehearsals', rehearsal)
    assert.equal(created.statusCode, 200, created.body)
    assert.equal((await push(lia, 'rehearsals', rehearsal)).statusCode, 200, 'reenvio sem mudança passa')
    assert.equal((await push(lia, 'rehearsal_songs', { rehearsal_id: rehearsalId, service_item_id: itemId })).statusCode, 200)
    assert.equal((await push(lia, 'rehearsal_songs', { rehearsal_id: rehearsalId, service_item_id: itemId })).statusCode, 200, 'reenvio do foco passa')
    assert.equal((await push(mauro, 'rehearsals', { ...rehearsal, notes: 'x' })).statusCode, 403, 'Membro edita')

    const read = await app.inject({ method: 'GET', url: `/sync/rehearsals?service_id=${serviceId}`, headers: { cookie: mauro.cookie } })
    assert.deepEqual(read.json().map((r: { id: string; location: string }) => [r.id, r.location]), [[rehearsalId, 'Sala 2']])
    const songs = await app.inject({ method: 'GET', url: `/sync/rehearsal_songs?rehearsal_id=${rehearsalId}`, headers: { cookie: mauro.cookie } })
    assert.deepEqual(songs.json().map((r: { service_item_id: string }) => r.service_item_id), [itemId])
    assert.equal((await app.inject({ method: 'DELETE', url: `/sync/rehearsals?id=${rehearsalId}`, headers: { cookie: mauro.cookie } })).json().count, 0, 'Membro exclui')
    assert.equal((await app.inject({ method: 'DELETE', url: `/sync/rehearsals?id=${rehearsalId}`, headers: { cookie: lia.cookie } })).json().count, 1)
  })
})

describe('escala (ADR-053, ADR-054)', () => {
  test('RPCs da escala, reenvio do convite por e-mail e escrita direta em assignments negada', async () => {
    const ip = { remoteAddress: '10.0.0.91' }
    const join = async (email: string, displayName: string) => {
      const response = await app.inject({ method: 'POST', url: '/auth/signup', ...ip, payload: { consentVersion: CONSENT_VERSION, ageDeclared: true, email, password: 'senha-forte-123', displayName } })
      assert.equal(response.statusCode, 201, response.body)
      return { cookie: cookieOf(response), id: response.json().user.id as string }
    }
    const lia = await join('lia.escala@teste.local', 'Lia')
    const mauro = await join('mauro.escala@teste.local', 'Mauro')
    const call = (user: { cookie: string }, name: string, payload: object) =>
      app.inject({ method: 'POST', url: `/rpc/${name}`, headers: { cookie: user.cookie }, payload })

    const orgId = crypto.randomUUID()
    const teamId = crypto.randomUUID()
    const serviceId = crypto.randomUUID()
    const positionId = crypto.randomUUID()
    assert.equal((await call(lia, 'create_organization', { p_id: orgId, p_name: 'Igreja da Lia' })).statusCode, 200)
    assert.equal((await app.inject({ method: 'POST', url: '/sync/teams', headers: { cookie: lia.cookie }, payload: { rows: [{ id: teamId, organization_id: orgId, name: 'Louvor' }] } })).statusCode, 200)
    await pool.query(`insert into public.organization_memberships (organization_id, user_id, role) values ($1, $2, 'member')`, [orgId, mauro.id])
    await pool.query('insert into public.team_memberships (team_id, user_id) values ($1, $2)', [teamId, mauro.id])
    const service = { id: serviceId, organization_id: orgId, team_id: teamId, name: 'Culto de domingo', starts_at: '2026-12-06T13:00:00Z', created_by_user_id: lia.id }
    assert.equal((await app.inject({ method: 'POST', url: '/sync/services', headers: { cookie: lia.cookie }, payload: { rows: [service] } })).statusCode, 200)
    const position = await app.inject({ method: 'POST', url: '/sync/service_positions', headers: { cookie: lia.cookie }, payload: { rows: [{ id: positionId, service_id: serviceId, musical_function: 'vocals', quantity: 2 }] } })
    assert.equal(position.statusCode, 200, position.body)

    const assigned = await call(lia, 'assign_member', { p_position_id: positionId, p_user_id: mauro.id })
    assert.equal(assigned.statusCode, 200, assigned.body)
    assert.equal(assigned.json().status, 'invited')
    const assignmentId = assigned.json().id as string

    // Escrita direta em assignments, pelo /sync, é negada para qualquer papel.
    for (const user of [lia, mauro]) {
      const write = await app.inject({ method: 'POST', url: '/sync/assignments', headers: { cookie: user.cookie }, payload: { rows: [{ id: assignmentId, status: 'confirmed' }] } })
      assert.equal(write.statusCode, 403, write.body)
    }
    // A função que devolve o e-mail do convidado não está na allowlist do /rpc.
    assert.equal((await call(lia, 'assignment_invite_mail', { p_assignment_id: assignmentId })).statusCode, 404)

    const resend = () => app.inject({ method: 'POST', url: `/schedule/assignments/${assignmentId}/resend-invite`, headers: { cookie: lia.cookie, origin: ORIGIN } })
    const invites = () => mails.filter((m) => m.purpose === 'assignment_invite')
    // Rascunho: o convite não sai (nem automático, nem reenvio) até o serviço passar de draft.
    assert.equal(invites().length, 0)
    assert.equal((await resend()).statusCode, 400)

    // Ao sair de draft, o convite pendente sai sozinho, uma vez (gancho pós-RPC).
    assert.equal((await call(lia, 'transition_service', { p_service_id: serviceId, p_to: 'ready' })).statusCode, 200)
    assert.equal(invites().length, 1)
    assert.equal(invites()[0].to, 'mauro.escala@teste.local')
    assert.equal((await call(lia, 'transition_service', { p_service_id: serviceId, p_to: 'draft' })).statusCode, 200)
    assert.equal((await call(lia, 'transition_service', { p_service_id: serviceId, p_to: 'ready' })).statusCode, 200)
    assert.equal(invites().length, 1, 'voltar a ready não duplica o convite')

    // Atribuir com o serviço já fora de draft envia na hora.
    const second = await call(lia, 'assign_member', { p_position_id: positionId, p_user_id: lia.id })
    assert.equal(second.statusCode, 200, second.body)
    assert.equal(invites().length, 2)
    assert.equal(invites()[1].to, 'lia.escala@teste.local')

    // Reenvio manual: dentro do minuto do envio automático, 429; liberado o intervalo, 204 e mais um e-mail.
    assert.equal((await resend()).statusCode, 429)
    await pool.query('update public.assignments set invite_sent_at = null where id = $1', [assignmentId])
    const before = mails.length
    assert.equal((await resend()).statusCode, 204)
    assert.equal(mails.length, before + 1)
    const mail = mails.at(-1)
    assert.equal(mail?.to, 'mauro.escala@teste.local')
    assert.equal(mail?.purpose, 'assignment_invite')
    assert.equal(mail?.link, `${ORIGIN}/meus-servicos`)
    assert.deepEqual({ ...mail?.invite, startsAt: undefined }, { name: 'Mauro', musicalFunction: 'vocals', service: 'Culto de domingo', startsAt: undefined })
    assert.equal(mail?.invite?.startsAt.toISOString(), '2026-12-06T13:00:00.000Z')

    assert.equal((await resend()).statusCode, 429) // no máximo um por minuto
    const asMember = await app.inject({ method: 'POST', url: `/schedule/assignments/${assignmentId}/resend-invite`, headers: { cookie: mauro.cookie, origin: ORIGIN } })
    assert.equal(asMember.statusCode, 400)
    assert.equal(asMember.json().error, 'assignment not found or not authorized')
    assert.equal((await app.inject({ method: 'POST', url: `/schedule/assignments/${assignmentId}/resend-invite`, headers: { origin: ORIGIN } })).statusCode, 401)
    assert.equal((await app.inject({ method: 'POST', url: '/schedule/assignments/nao-e-uuid/resend-invite', headers: { cookie: lia.cookie, origin: ORIGIN } })).statusCode, 400)

    // O titular responde pela RPC; depois disso não há mais convite pendente para reenviar.
    const confirmed = await call(mauro, 'respond_to_assignment', { p_assignment_id: assignmentId, p_response: 'confirm' })
    assert.equal(confirmed.json().status, 'confirmed')
    await pool.query(`update public.assignments set invite_sent_at = null where id = $1`, [assignmentId])
    assert.equal((await resend()).statusCode, 400)

    // Substituir convida o substituto na hora (replace_assignment também dispara o convite).
    const novo = await join('novo.escala@teste.local', 'Novo')
    await pool.query(`insert into public.organization_memberships (organization_id, user_id, role) values ($1, $2, 'member')`, [orgId, novo.id])
    await pool.query('insert into public.team_memberships (team_id, user_id) values ($1, $2)', [teamId, novo.id])
    const sentBefore = invites().length
    const replaced = await call(lia, 'replace_assignment', { p_assignment_id: assignmentId, p_new_user_id: novo.id })
    assert.equal(replaced.statusCode, 200, replaced.body)
    assert.equal(replaced.json().status, 'invited')
    assert.equal(invites().length, sentBefore + 1)
    assert.equal(invites().at(-1)?.to, 'novo.escala@teste.local')
  })

  test('gancho de convites: e-mails em paralelo e só o que falhou volta à fila', async () => {
    const calls: { sql: string; params: unknown[] }[] = []
    const invite = (id: string) => ({ assignment_id: id, email: `${id}@teste.local`, display_name: id, musical_function: 'keys', service_name: 'S', starts_at: new Date() })
    const fakePool = {
      connect: async () => ({
        query: async (sql: string, params: unknown[] = []) => {
          calls.push({ sql, params })
          return { rows: sql.includes('claim_pending_invites') ? [invite('a'), invite('b'), invite('c')] : [] }
        },
        release() {},
      }),
    } as unknown as Pool
    const slow = { send: async ({ to }: { to: string }) => { await new Promise((resolve) => setTimeout(resolve, 300)); if (to.startsWith('b@')) throw new Error('Brevo fora') } }
    const started = Date.now()
    await inviteHook(fakePool, slow, ORIGIN)({ name: 'replace_assignment', userId: 'u', row: { service_id: 's' }, log: { error() {} } as never })
    assert.ok(Date.now() - started < 800, 'três envios de 300 ms em paralelo')
    const released = calls.filter((call) => call.sql.includes('release_invite'))
    assert.deepEqual(released.map((call) => call.params), [['b']])
    // Qualquer outra RPC não dispara nada.
    calls.length = 0
    await inviteHook(fakePool, slow, ORIGIN)({ name: 'cancel_assignment', userId: 'u', row: { service_id: 's' }, log: { error() {} } as never })
    assert.equal(calls.length, 0)
  })

  test('Brevo fora do ar: transição e atribuição seguem, sem 500 e sem vazar endereço', async () => {
    const lines: string[] = []
    const failing = await buildApp({
      pool, appOrigin: ORIGIN,
      logger: { level: 'error', stream: { write: (line: string) => void lines.push(line) } },
      mailer: { send: async () => { throw new Error('Brevo recusou o envio (HTTP 401)') } },
    })
    try {
      const response = await failing.inject({ method: 'POST', url: '/auth/signup', remoteAddress: '10.0.0.92', payload: { consentVersion: CONSENT_VERSION, ageDeclared: true, email: 'sem.brevo@teste.local', password: 'senha-forte-123', displayName: 'Sem Brevo' } })
      const cookie = cookieOf(response)
      const userId = response.json().user.id as string
      const call = (name: string, payload: object) => failing.inject({ method: 'POST', url: `/rpc/${name}`, headers: { cookie }, payload })
      const orgId = crypto.randomUUID(), teamId = crypto.randomUUID(), serviceId = crypto.randomUUID(), positionId = crypto.randomUUID()
      await call('create_organization', { p_id: orgId, p_name: 'Sem Brevo' })
      await failing.inject({ method: 'POST', url: '/sync/teams', headers: { cookie }, payload: { rows: [{ id: teamId, organization_id: orgId, name: 'T' }] } })
      await failing.inject({ method: 'POST', url: '/sync/services', headers: { cookie }, payload: { rows: [{ id: serviceId, organization_id: orgId, team_id: teamId, name: 'S', starts_at: '2026-12-06T13:00:00Z', created_by_user_id: userId }] } })
      await failing.inject({ method: 'POST', url: '/sync/service_positions', headers: { cookie }, payload: { rows: [{ id: positionId, service_id: serviceId, musical_function: 'keys', quantity: 2 }] } })
      assert.equal((await call('assign_member', { p_position_id: positionId, p_user_id: userId })).statusCode, 200)
      const ready = await call('transition_service', { p_service_id: serviceId, p_to: 'ready' })
      assert.equal(ready.statusCode, 200, ready.body)
      assert.equal(ready.json().status, 'ready')
      const { rows } = await pool.query('select status, invite_sent_at is not null as claimed from public.assignments where position_id = $1', [positionId])
      // A falha devolve o convite à fila (ADR-054 §3): nada fica marcado como enviado.
      assert.deepEqual(rows, [{ status: 'invited', claimed: false }])
      const errors = lines.filter((line) => line.includes('falha ao enviar e-mail') && line.includes('assignment_invite'))
      assert.equal(errors.length, 1)
      assert.doesNotMatch(errors[0], /sem\.brevo|meus-servicos|xkeysib/)

      // Na próxima oportunidade (outra transição, agora com o provedor no ar) o convite sai.
      const before = mails.length
      const retry = await app.inject({ method: 'POST', url: '/rpc/transition_service', headers: { cookie }, payload: { p_service_id: serviceId, p_to: 'in_progress' } })
      assert.equal(retry.statusCode, 200, retry.body)
      assert.equal(mails.length, before + 1)
      assert.equal(mails.at(-1)?.to, 'sem.brevo@teste.local')
    } finally {
      await failing.close()
    }
  })

  test('mailer Brevo: o convite leva pessoa, função, serviço, data e link, sem token', async () => {
    const calls: { body: string }[] = []
    const mailer = brevoMailer({ apiKey: 'chave', from: 'x@exemplo.com', fetch: async (_url, init) => { calls.push({ body: String(init?.body) }); return new Response('{}', { status: 201 }) } })
    await mailer.send({
      to: 'mauro@teste.local', purpose: 'assignment_invite', link: 'https://app.exemplo/meus-servicos',
      invite: { name: 'Mauro', musicalFunction: 'drums', service: 'Culto', startsAt: new Date('2026-12-06T13:00:00Z') },
    })
    const body = JSON.parse(calls[0].body)
    assert.equal(body.subject, 'Você foi escalado no CANTUM')
    assert.match(body.textContent, /Mauro/)
    assert.match(body.textContent, /bateria/)
    assert.match(body.textContent, /"Culto"/)
    assert.match(body.textContent, /domingo, 6 de dezembro de 2026/)
    assert.match(body.textContent, /10:00/)
    assert.match(body.textContent, /https:\/\/app\.exemplo\/meus-servicos/)
  })
})

describe('provedor de e-mail fora do ar', () => {
  test('cadastro, reenvio e reset seguem sem 500 e o log não vaza endereço, link nem chave', async () => {
    const lines: string[] = []
    const failing = await buildApp({
      pool, appOrigin: ORIGIN,
      logger: { level: 'error', stream: { write: (line: string) => void lines.push(line) } },
      mailer: { send: async () => { throw new Error('Brevo recusou o envio (HTTP 401)') } },
    })
    try {
      const ip = { remoteAddress: '10.0.0.90' }
      const signup = await failing.inject({ method: 'POST', url: '/auth/signup', ...ip, payload: { consentVersion: CONSENT_VERSION, ageDeclared: true, email: 'sem.correio@teste.local', password: 'senha-forte-123', displayName: 'Sem Correio' } })
      assert.equal(signup.statusCode, 201, signup.body)
      const cookie = cookieOf(signup)
      assert.equal((await failing.inject({ method: 'GET', url: '/auth/session', headers: { cookie } })).statusCode, 200)

      // Reenvio dentro do cooldown não manda nada; fora dele, a falha também vira 204.
      await pool.query(`update app.email_tokens set created_at = now() - interval '1 hour', expires_at = now() + interval '1 hour'
        where user_id = (select id from app.users where email = 'sem.correio@teste.local')`)
      const resend = await failing.inject({ method: 'POST', url: '/auth/verify-email/resend', ...ip, headers: { cookie } })
      assert.equal(resend.statusCode, 204, resend.body)

      const reset = await failing.inject({ method: 'POST', url: '/auth/password-reset/request', ...ip, payload: { email: 'sem.correio@teste.local' } })
      assert.equal(reset.statusCode, 204, reset.body)

      const errors = lines.filter((line) => line.includes('falha ao enviar e-mail'))
      assert.equal(errors.length, 3)
      for (const line of errors) {
        assert.doesNotMatch(line, /sem\.correio|token=|xkeysib/)
        assert.match(line, /HTTP 401/)
      }
    } finally {
      await failing.close()
    }
  })
})

describe('deploy (ADR-060)', () => {
  test('migrador em Node: segunda execução não aplica nada e o usuário entra nos papéis', async () => {
    assert.deepEqual(await migrate({ database: DB }), [])
    // pg_auth_members, não pg_has_role: no teste o usuário é superusuário e pg_has_role daria true de qualquer jeito.
    const { rows } = await pool.query(`select count(*)::int as n from pg_auth_members m join pg_roles r on r.oid = m.roleid
      where m.member = (select oid from pg_roles where rolname = current_user) and r.rolname in ('cantum_user', 'cantum_anon')`)
    assert.equal(rows[0].n, 2)
  })

  test('front servido na mesma origem, com fallback de SPA fora da API', async () => {
    const root = await mkdtemp(`${tmpdir()}/cantum-dist-`)
    await mkdir(`${root}/assets`)
    await writeFile(`${root}/index.html`, '<!doctype html><title>CANTUM</title>')
    await writeFile(`${root}/assets/app-abc123.js`, 'console.log(1)')
    const web = await buildApp({ pool, appOrigin: ORIGIN, logger: false, staticRoot: root })
    try {
      const index = await web.inject({ method: 'GET', url: '/' })
      assert.equal(index.statusCode, 200)
      assert.match(index.body, /CANTUM/)
      assert.equal(index.headers['cache-control'], 'no-cache')
      const asset = await web.inject({ method: 'GET', url: '/assets/app-abc123.js' })
      assert.equal(asset.statusCode, 200)
      assert.match(String(asset.headers['cache-control']), /immutable/)
      const route = await web.inject({ method: 'GET', url: '/organizacao/servicos/123?aba=ordem' })
      assert.equal(route.statusCode, 200)
      assert.match(route.body, /CANTUM/)

      // Links dos e-mails e telas de /auth são do front.
      for (const url of ['/auth', '/auth/verify-email?token=x', '/auth/reset-password?token=x', '/auth/forgot-password']) {
        const response = await web.inject({ method: 'GET', url })
        assert.equal(response.statusCode, 200, url)
        assert.match(response.body, /CANTUM/, url)
      }

      for (const url of ['/rpc/x', '/realtime/x', '/health/x', '/sync', '/assets/sumiu.js']) {
        const response = await web.inject({ method: 'GET', url })
        assert.equal(response.statusCode, 404, url)
        assert.doesNotMatch(response.body, /CANTUM/, url)
      }
      assert.equal((await web.inject({ method: 'GET', url: '/health' })).json().ok, true)
      assert.equal((await web.inject({ method: 'GET', url: '/auth/session' })).statusCode, 401)
    } finally {
      await web.close()
      await rm(root, { recursive: true })
    }
  })

  test('mailer Brevo: chama a API transacional e falha sem vazar a chave', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const ok = brevoMailer({
      apiKey: 'chave-secreta', from: 'CANTUM <nao-responda@exemplo.com>',
      fetch: async (url, init) => { calls.push({ url: String(url), init: init ?? {} }); return new Response('{}', { status: 201 }) },
    })
    await ok.send({ to: 'ana@teste.local', purpose: 'verify_email', link: 'https://app.exemplo/auth/verify-email?token=abc' })
    assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email')
    assert.equal(calls[0].init.method, 'POST')
    assert.equal((calls[0].init.headers as Record<string, string>)['api-key'], 'chave-secreta')
    const body = JSON.parse(String(calls[0].init.body))
    assert.deepEqual(body.sender, { name: 'CANTUM', email: 'nao-responda@exemplo.com' })
    assert.deepEqual(body.to, [{ email: 'ana@teste.local' }])
    assert.match(body.subject, /Confirme seu e-mail/)
    assert.match(body.textContent, /token=abc/)

    const failing = brevoMailer({ apiKey: 'chave-secreta', from: 'x@exemplo.com', fetch: async () => new Response('erro', { status: 401 }) })
    await assert.rejects(
      failing.send({ to: 'ana@teste.local', purpose: 'reset_password', link: 'https://app.exemplo/x?token=abc' }),
      (error: Error) => /HTTP 401/.test(error.message) && !error.message.includes('chave-secreta') && !error.message.includes('token=abc'),
    )
  })

  test('TRUST_PROXY por saltos: X-Forwarded-For forjado não muda o IP nem burla o rate limit', async () => {
    const proxied = await buildApp({ pool, appOrigin: ORIGIN, logger: false, trustProxy: 1 })
    proxied.get('/eco-ip', async (request) => ({ ip: request.ip }))
    const direct = await buildApp({ pool, appOrigin: ORIGIN, logger: false })
    direct.get('/eco-ip', async (request) => ({ ip: request.ip }))
    try {
      // O proxy (Render) acrescenta o IP real no fim; o começo vem do cliente.
      const forged = (fake: string) => ({ 'x-forwarded-for': `${fake}, 203.0.113.9` })
      for (const fake of ['6.6.6.6', '7.7.7.7']) {
        assert.equal((await proxied.inject({ method: 'GET', url: '/eco-ip', headers: forged(fake) })).json().ip, '203.0.113.9')
      }
      assert.equal((await direct.inject({ method: 'GET', url: '/eco-ip', headers: forged('6.6.6.6') })).json().ip, '127.0.0.1')

      // 10 por minuto nas rotas de auth: trocar o IP forjado não abre cota nova.
      for (let i = 0; i < 10; i++) {
        const response = await proxied.inject({ method: 'POST', url: '/auth/verify-email', headers: forged(`10.0.0.${i}`), payload: { token: 'x'.repeat(30) } })
        assert.equal(response.statusCode, 400)
      }
      const blocked = await proxied.inject({ method: 'POST', url: '/auth/verify-email', headers: forged('10.0.0.99'), payload: { token: 'x'.repeat(30) } })
      assert.equal(blocked.statusCode, 429)
    } finally {
      await proxied.close()
      await direct.close()
    }
  })

  test('log de requisição traz o IP do cliente resolvido pelo trust proxy', async () => {
    const lines: string[] = []
    const proxied = await buildApp({ pool, appOrigin: ORIGIN, trustProxy: 1, logger: { level: 'info', stream: { write: (line: string) => void lines.push(line) } } })
    try {
      await proxied.inject({ method: 'GET', url: '/health', remoteAddress: '10.1.2.3', headers: { 'x-forwarded-for': '6.6.6.6, 1.2.3.4' } })
      const request = lines.map((line) => JSON.parse(line)).find((entry) => entry.msg === 'incoming request')
      assert.equal(request.req.ip, '1.2.3.4')
      assert.equal(request.req.remoteAddress, '10.1.2.3')
    } finally {
      await proxied.close()
    }
  })

  test('log de requisição sem query string (tokens dos links de e-mail)', async () => {
    const lines: string[] = []
    const logged = await buildApp({ pool, appOrigin: ORIGIN, logger: { level: 'info', stream: { write: (line: string) => void lines.push(line) } } })
    try {
      await logged.inject({ method: 'GET', url: '/auth/verify-email?token=segredo-do-link-123' }) // 404 sem front
      await logged.inject({ method: 'GET', url: '/health?token=segredo-do-link-123', headers: { cookie: 'cantum_session=segredo-do-cookie' } })
      const all = lines.join('')
      assert.match(all, /"url":"\/auth\/verify-email"/)
      assert.match(all, /"url":"\/health"/)
      assert.doesNotMatch(all, /segredo-do-link|segredo-do-cookie/)
    } finally {
      await logged.close()
    }
  })
})

describe('consentimento (B8, RN-01/D7)', () => {
  const base = { password: 'senha-forte-123', displayName: 'Consentida' }

  test('cadastro sem aceite ou com versão que não é a vigente é recusado e não cria conta', async () => {
    const semAceite = await app.inject({ method: 'POST', url: '/auth/signup', remoteAddress: '10.0.0.110', payload: { ...base, email: 'sem.aceite@teste.local' } })
    assert.equal(semAceite.statusCode, 400)
    const antiga = await app.inject({ method: 'POST', url: '/auth/signup', remoteAddress: '10.0.0.110', payload: { ...base, email: 'sem.aceite@teste.local', consentVersion: '1999-01-01', ageDeclared: true } })
    assert.equal(antiga.statusCode, 400)
    const semIdade = await app.inject({ method: 'POST', url: '/auth/signup', remoteAddress: '10.0.0.110', payload: { ...base, email: 'sem.aceite@teste.local', consentVersion: CONSENT_VERSION } })
    assert.equal(semIdade.statusCode, 400)
    const idadeFalsa = await app.inject({ method: 'POST', url: '/auth/signup', remoteAddress: '10.0.0.110', payload: { ...base, email: 'sem.aceite@teste.local', consentVersion: CONSENT_VERSION, ageDeclared: false } })
    assert.equal(idadeFalsa.statusCode, 400)
    for (const ageDeclared of ['true', 1, null, 'false', false]) {
      const response = await app.inject({ method: 'POST', url: '/auth/signup', remoteAddress: '10.0.0.110', payload: { ...base, email: 'sem.aceite@teste.local', consentVersion: CONSENT_VERSION, ageDeclared } })
      assert.equal(response.statusCode, 400, String(ageDeclared))
    }
    assert.equal((await pool.query("select 1 from app.users where email = 'sem.aceite@teste.local'")).rowCount, 0)
  })

  test('cadastro com aceite grava os dois documentos; nova versão exige re-aceite no login', async () => {
    const response = await app.inject({ method: 'POST', url: '/auth/signup', remoteAddress: '10.0.0.111', payload: { ...base, email: 'aceite@teste.local', consentVersion: CONSENT_VERSION, ageDeclared: true } })
    assert.equal(response.statusCode, 201)
    assert.equal(response.json().user.consentRequired, false)
    const id = response.json().user.id as string
    const rows = await pool.query('select document, version from public.user_consents where user_id = $1 order by document', [id])
    assert.deepEqual(rows.rows, [{ document: 'age', version: CONSENT_VERSION }, { document: 'privacy', version: CONSENT_VERSION }, { document: 'terms', version: CONSENT_VERSION }])
    // Simula a troca de versão: sem aceite da vigente, o login e a sessão sinalizam o re-aceite.
    await pool.query('update public.user_consents set version = $2 where user_id = $1', [id, '2000-01-01'])
    const login = await app.inject({ method: 'POST', url: '/auth/login', remoteAddress: '10.0.0.111', payload: { email: 'aceite@teste.local', password: base.password } })
    assert.equal(login.json().user.consentRequired, true)
    const cookie = cookieOf(login)
    // record_consent pelo /rpc, como o cliente faz, e a sessão volta a estar em dia.
    for (const document of ['privacy', 'terms']) {
      const rpc = await app.inject({ method: 'POST', url: '/rpc/record_consent', headers: { cookie, origin: ORIGIN }, payload: { p_document: document, p_version: CONSENT_VERSION } })
      assert.equal(rpc.statusCode, 200, rpc.body)
    }
    const session = await app.inject({ method: 'GET', url: '/auth/session', headers: { cookie } })
    assert.equal(session.json().user.consentRequired, false)
  })
})

describe('reautenticação para excluir a conta (B8, ADR-065)', () => {
  const PASSWORD = 'senha-forte-123'
  // IPs próprios: o limite de /auth/* (10/min por IP) não interfere nos outros testes.
  const reauthIp = '10.0.0.120'
  const create = async (email: string) => {
    const response = await app.inject({ method: 'POST', url: '/auth/signup', remoteAddress: '10.0.0.121', payload: { consentVersion: CONSENT_VERSION, ageDeclared: true, email, password: PASSWORD, displayName: 'Reauth' } })
    assert.equal(response.statusCode, 201, response.body)
    return { cookie: cookieOf(response), id: response.json().user.id as string }
  }
  const login = async (email: string) => cookieOf(await app.inject({ method: 'POST', url: '/auth/login', remoteAddress: '10.0.0.122', payload: { email, password: PASSWORD } }))
  const reauth = (cookie: string, password = PASSWORD, remoteAddress = reauthIp) =>
    app.inject({ method: 'POST', url: '/auth/reauth', remoteAddress, headers: { cookie }, payload: { password } })
  const deleteAccount = (cookie: string) => app.inject({ method: 'POST', url: '/rpc/delete_my_account', headers: { cookie }, payload: {} })
  const exists = async (id: string) => (await pool.query('select 1 from app.users where id = $1', [id])).rowCount === 1

  test('R1/R2/R5: sem reauth, com senha errada ou expirada o banco recusa; com senha certa a exclusão funciona', async () => {
    const { cookie, id } = await create('reauth.fluxo@teste.local')
    const never = await deleteAccount(cookie)
    assert.equal(never.statusCode, 403)
    assert.equal(never.json().error, 'reauth_required')
    assert.equal(await exists(id), true)

    const wrong = await reauth(cookie, 'senha-errada-123')
    assert.equal(wrong.statusCode, 401)
    assert.equal((await pool.query('select reauth_at from app.sessions where user_id = $1', [id])).rows[0].reauth_at, null)
    assert.equal((await deleteAccount(cookie)).statusCode, 403)

    assert.equal((await reauth(cookie)).statusCode, 204)
    // Janela de 5 min fixa: reauth_at antigo (relógio do banco) volta a exigir a senha.
    await pool.query(`update app.sessions set reauth_at = now() - interval '5 minutes 1 second' where user_id = $1`, [id])
    const expired = await deleteAccount(cookie)
    assert.equal(expired.statusCode, 403)
    assert.equal(expired.json().error, 'reauth_required')
    assert.equal(await exists(id), true)

    assert.equal((await reauth(cookie)).statusCode, 204)
    assert.equal((await deleteAccount(cookie)).statusCode, 200)
    assert.equal(await exists(id), false)
  })

  test('R3: anônimo, sessão revogada e sessão expirada recebem 401', async () => {
    assert.equal((await app.inject({ method: 'POST', url: '/auth/reauth', remoteAddress: reauthIp, payload: { password: PASSWORD } })).statusCode, 401)
    const { cookie, id } = await create('reauth.revogada@teste.local')
    await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie } })
    assert.equal((await reauth(cookie)).statusCode, 401)
    const second = await login('reauth.revogada@teste.local')
    await pool.query(`update app.sessions set expires_at = now() - interval '1 second', created_at = now() - interval '1 day' where user_id = $1`, [id])
    assert.equal((await reauth(second)).statusCode, 401)
    assert.equal((await deleteAccount(second)).statusCode, 401)
  })

  test('R4: o reauth de um usuário não vale para outro', async () => {
    const a = await create('reauth.a@teste.local')
    const b = await create('reauth.b@teste.local')
    assert.equal((await reauth(a.cookie)).statusCode, 204)
    const denied = await deleteAccount(b.cookie)
    assert.equal(denied.statusCode, 403)
    assert.equal(denied.json().error, 'reauth_required')
    assert.equal(await exists(b.id), true)
    assert.equal(await exists(a.id), true)
  })

  test('R6: o reauth vale só para a sessão que reautenticou (outro aparelho do mesmo usuário)', async () => {
    const one = await create('reauth.aparelhos@teste.local')
    const two = await login('reauth.aparelhos@teste.local')
    assert.equal((await reauth(one.cookie)).statusCode, 204)
    const other = await deleteAccount(two)
    assert.equal(other.statusCode, 403)
    assert.equal(other.json().error, 'reauth_required')
    assert.equal(await exists(one.id), true)
    assert.equal((await deleteAccount(one.cookie)).statusCode, 200)
    assert.equal(await exists(one.id), false)
  })

  test('R7: o cliente não forja o contexto pelo /rpc, e a configuração não vaza entre requisições', async () => {
    const { cookie, id } = await create('reauth.forja@teste.local')
    for (const payload of [{ 'app.session_reauth_at': new Date().toISOString() }, { p_reauth_at: new Date().toISOString() }]) {
      const forged = await app.inject({ method: 'POST', url: '/rpc/delete_my_account', headers: { cookie }, payload })
      assert.equal(forged.statusCode, 400)
    }
    assert.equal((await deleteAccount(cookie)).statusCode, 403)
    // Sessão reautenticada e outra não: requisições alternadas no mesmo pool não herdam o fato uma da outra.
    const other = await create('reauth.vazamento@teste.local')
    assert.equal((await reauth(cookie, PASSWORD, '10.0.0.125')).statusCode, 204)
    for (let i = 0; i < 6; i++) {
      assert.equal((await deleteAccount(other.cookie)).statusCode, 403, `rodada ${i}`)
      assert.equal(await exists(other.id), true)
    }
    assert.equal(await exists(id), true)
  })

  test('R9: a 11ª tentativa por minuto em /auth/reauth leva 429', async () => {
    const { cookie } = await create('reauth.limite@teste.local')
    const ip = '10.0.0.123'
    for (let i = 0; i < 10; i++) assert.equal((await reauth(cookie, 'senha-errada-123', ip)).statusCode, 401, `tentativa ${i + 1}`)
    assert.equal((await reauth(cookie, 'senha-errada-123', ip)).statusCode, 429)
  })

  test('R10: usuário sem senha (sentinela "Ex-membro") nunca passa', async () => {
    const token = newToken()
    const { rows } = await pool.query<{ id: string }>('select app.deleted_user_id() as id')
    await pool.query(`insert into app.sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '1 day')`, [token.hash, rows[0].id])
    const cookie = `cantum_session=${token.token}`
    for (const password of ['x', 'qualquer-senha-123']) assert.equal((await reauth(cookie, password, '10.0.0.124')).statusCode, 401)
    assert.equal((await pool.query('select reauth_at from app.sessions where token_hash = $1', [token.hash])).rows[0].reauth_at, null)
  })
})
