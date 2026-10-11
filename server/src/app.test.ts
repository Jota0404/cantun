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
import { hashPassword, verifyPassword } from './auth.ts'
import { createPool } from './db.ts'
import type { Pool } from './db.ts'
import type { Mail } from './mailer.ts'
import { brevoMailer } from './mailer.ts'
import { migrate } from './migrate.ts'

const DB = 'cantum_server_test'
const ORIGIN = 'http://localhost:5173'

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
  const response = await app.inject({ method: 'POST', url: '/auth/signup', payload: { email, password, displayName } })
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
    const response = await app.inject({ method: 'POST', url: '/auth/signup', payload: { email: 'Ana@Teste.Local', password: 'senha-forte-123', displayName: '  Ana Souza ' } })
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
    assert.equal((await app.inject({ method: 'POST', url: '/auth/signup', payload: { email: 'ana@teste.local', password: 'outra-senha-123', displayName: 'Ana' } })).statusCode, 409)
    assert.equal((await app.inject({ method: 'POST', url: '/auth/signup', payload: { email: 'curta@teste.local', password: '123', displayName: 'Curta' } })).statusCode, 400)
    const wrong = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'ana@teste.local', password: 'errada-123' } })
    assert.equal(wrong.statusCode, 401)
    const unknown = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'ninguem@teste.local', password: 'qualquer-123' } })
    assert.equal(unknown.statusCode, 401)
    assert.equal(wrong.json().error, unknown.json().error)
  })

  test('cadastro exige nome de exibição com 1 a 80 caracteres', async () => {
    // IP próprio: não consome o limite de cadastro dos outros testes.
    for (const displayName of [undefined, '', '   ', 'x'.repeat(81)]) {
      const response = await app.inject({ method: 'POST', url: '/auth/signup', remoteAddress: '10.0.0.80', payload: { email: 'sem.nome@teste.local', password: 'senha-forte-123', displayName } })
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
      const signup = await failing.inject({ method: 'POST', url: '/auth/signup', ...ip, payload: { email: 'sem.correio@teste.local', password: 'senha-forte-123', displayName: 'Sem Correio' } })
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
