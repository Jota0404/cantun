import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { Pool } from './db.ts'
import { HttpError } from './db.ts'
import type { Mailer } from './mailer.ts'

// Parâmetros OWASP para scrypt (N=2^17, r=8, p=1); maxmem acima de 128·N·r.
const SCRYPT = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }
const KEY_LENGTH = 64
const SESSION_DAYS = 30
export const SESSION_COOKIE = 'cantum_session'

function scryptAsync(password: string, salt: Buffer, params: typeof SCRYPT): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, params, (error, key) => (error ? reject(error) : resolve(key)))
  })
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scryptAsync(password, salt, SCRYPT)
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, key] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !key) return false
  const expected = Buffer.from(key, 'base64')
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), { ...SCRYPT, N: Number(n), r: Number(r), p: Number(p) })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// Hash fixo para igualar o tempo de resposta quando o e-mail não existe.
const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'))

export function newToken(): { token: string; hash: Buffer } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: tokenHash(token) }
}

export function tokenHash(token: string): Buffer {
  return createHash('sha256').update(token).digest()
}

export async function sessionUserId(pool: Pool, token: string | undefined): Promise<string | null> {
  return token ? userIdForSessionHash(pool, tokenHash(token)) : null
}

export async function userIdForSessionHash(pool: Pool, hash: Buffer): Promise<string | null> {
  const { rows } = await pool.query<{ user_id: string }>(
    'select user_id from app.sessions where token_hash = $1 and revoked_at is null and expires_at > now()',
    [hash],
  )
  return rows[0]?.user_id ?? null
}

interface UserRow {
  id: string
  email: string
  email_verified_at: Date | null
}

const toUser = (row: UserRow) => ({ id: row.id, email: row.email, emailVerified: row.email_verified_at !== null })

const emailSchema = { type: 'string', minLength: 3, maxLength: 254, pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' }
const passwordSchema = { type: 'string', minLength: 8, maxLength: 128 }
const tokenSchema = { type: 'string', minLength: 20, maxLength: 200 }
const authLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } }

export interface AuthOptions {
  pool: Pool
  mailer: Mailer
  appOrigin: string
  secureCookies: boolean
}

export async function authRoutes(app: FastifyInstance, { pool, mailer, appOrigin, secureCookies }: AuthOptions) {
  async function startSession(reply: FastifyReply, userId: string) {
    const { token, hash } = newToken()
    await pool.query(
      `insert into app.sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))`,
      [hash, userId, SESSION_DAYS],
    )
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_DAYS * 24 * 60 * 60,
    })
  }

  async function sendEmailToken(userId: string, email: string, purpose: 'verify_email' | 'reset_password') {
    const { token, hash } = newToken()
    const hours = purpose === 'verify_email' ? 24 : 1
    await pool.query(
      `insert into app.email_tokens (token_hash, user_id, purpose, expires_at) values ($1, $2, $3, now() + make_interval(hours => $4))`,
      [hash, userId, purpose, hours],
    )
    const path = purpose === 'verify_email' ? 'verify-email' : 'reset-password'
    await mailer.send({ to: email, purpose, link: `${appOrigin}/auth/${path}?token=${token}` })
  }

  async function useEmailToken(token: string, purpose: 'verify_email' | 'reset_password'): Promise<string> {
    const { rows } = await pool.query<{ user_id: string }>(
      `update app.email_tokens set used_at = now()
        where token_hash = $1 and purpose = $2 and used_at is null and expires_at > now()
        returning user_id`,
      [tokenHash(token), purpose],
    )
    if (!rows[0]) throw new HttpError(400, 'link inválido ou expirado')
    return rows[0].user_id
  }

  app.post<{ Body: { email: string; password: string } }>('/auth/signup', {
    config: authLimit,
    schema: { body: { type: 'object', required: ['email', 'password'], additionalProperties: false, properties: { email: emailSchema, password: passwordSchema } } },
  }, async (request, reply) => {
    const email = request.body.email.trim().toLowerCase()
    const passwordHash = await hashPassword(request.body.password)
    const { rows } = await pool.query<UserRow>(
      `insert into app.users (email, password_hash) values ($1, $2)
       on conflict (email) do nothing
       returning id, email, email_verified_at`,
      [email, passwordHash],
    )
    if (!rows[0]) throw new HttpError(409, 'e-mail já cadastrado')
    await sendEmailToken(rows[0].id, email, 'verify_email')
    await startSession(reply, rows[0].id)
    return reply.code(201).send({ user: toUser(rows[0]) })
  })

  app.post<{ Body: { email: string; password: string } }>('/auth/login', {
    config: authLimit,
    schema: { body: { type: 'object', required: ['email', 'password'], additionalProperties: false, properties: { email: emailSchema, password: { type: 'string', maxLength: 128 } } } },
  }, async (request, reply) => {
    const { rows } = await pool.query<UserRow & { password_hash: string | null }>(
      'select id, email, email_verified_at, password_hash from app.users where email = $1',
      [request.body.email.trim().toLowerCase()],
    )
    const user = rows[0]
    const valid = await verifyPassword(request.body.password, user?.password_hash ?? (await DUMMY_HASH))
    if (!user || !user.password_hash || !valid) throw new HttpError(401, 'e-mail ou senha inválidos')
    await startSession(reply, user.id)
    return { user: toUser(user) }
  })

  app.post('/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE]
    if (token) await pool.query('update app.sessions set revoked_at = now() where token_hash = $1 and revoked_at is null', [tokenHash(token)])
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return reply.code(204).send()
  })

  app.get('/auth/session', async (request) => {
    if (!request.userId) throw new HttpError(401, 'sessão inválida')
    const { rows } = await pool.query<UserRow>('select id, email, email_verified_at from app.users where id = $1', [request.userId])
    if (!rows[0]) throw new HttpError(401, 'sessão inválida')
    return { user: toUser(rows[0]) }
  })

  app.post<{ Body: { token: string } }>('/auth/verify-email', {
    config: authLimit,
    schema: { body: { type: 'object', required: ['token'], additionalProperties: false, properties: { token: tokenSchema } } },
  }, async (request, reply) => {
    const userId = await useEmailToken(request.body.token, 'verify_email')
    await pool.query('update app.users set email_verified_at = coalesce(email_verified_at, now()), updated_at = now() where id = $1', [userId])
    return reply.code(204).send()
  })

  app.post<{ Body: { email: string } }>('/auth/password-reset/request', {
    config: authLimit,
    schema: { body: { type: 'object', required: ['email'], additionalProperties: false, properties: { email: emailSchema } } },
  }, async (request, reply) => {
    const email = request.body.email.trim().toLowerCase()
    const { rows } = await pool.query<{ id: string }>('select id from app.users where email = $1', [email])
    // Mesma resposta exista ou não a conta (sem enumeração de e-mails).
    if (rows[0]) await sendEmailToken(rows[0].id, email, 'reset_password')
    return reply.code(204).send()
  })

  app.post<{ Body: { token: string; password: string } }>('/auth/password-reset/confirm', {
    config: authLimit,
    schema: { body: { type: 'object', required: ['token', 'password'], additionalProperties: false, properties: { token: tokenSchema, password: passwordSchema } } },
  }, async (request, reply) => {
    const userId = await useEmailToken(request.body.token, 'reset_password')
    const passwordHash = await hashPassword(request.body.password)
    await pool.query('update app.users set password_hash = $2, updated_at = now() where id = $1', [userId, passwordHash])
    await pool.query('update app.sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [userId])
    return reply.code(204).send()
  })
}
