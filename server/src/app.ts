import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import type { FastifyServerOptions } from 'fastify'
import { authRoutes, SESSION_COOKIE, sessionUserId } from './auth.ts'
import { loadCatalog } from './catalog.ts'
import { dataRoutes } from './data.ts'
import type { Pool } from './db.ts'
import { fromPgError, HttpError } from './db.ts'
import type { Mailer } from './mailer.ts'
import { devMailer } from './mailer.ts'

declare module 'fastify' {
  interface FastifyRequest {
    userId: string | null
  }
}

export interface AppOptions {
  pool: Pool
  appOrigin: string
  mailer?: Mailer
  logger?: FastifyServerOptions['logger']
}

export async function buildApp({ pool, appOrigin, mailer, logger = true }: AppOptions) {
  const app = Fastify({
    logger: logger === true ? { redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'] } : logger,
  })
  const catalog = await loadCatalog(pool)

  await app.register(cookie)
  await app.register(cors, { origin: appOrigin, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'] })
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' })

  app.decorateRequest('userId', null)

  app.addHook('onRequest', async (request) => {
    // Defesa contra CSRF além do SameSite=Lax: escrita só da origem do app.
    const origin = request.headers.origin
    if (request.method !== 'GET' && request.method !== 'HEAD' && origin && origin !== appOrigin) {
      throw new HttpError(403, 'origem não permitida')
    }
    request.userId = await sessionUserId(pool, request.cookies[SESSION_COOKIE])
  })

  app.setErrorHandler((error, request, reply) => {
    const http = error instanceof HttpError ? error : fromPgError(error)
    if (http) return reply.code(http.status).send({ error: http.message })
    const status = (error as { statusCode?: number }).statusCode
    if (status && status < 500) return reply.code(status).send({ error: (error as Error).message })
    request.log.error({ err: { code: (error as { code?: string }).code, message: (error as Error).message } }, 'erro interno')
    return reply.code(500).send({ error: 'erro interno' })
  })

  app.get('/health', async () => {
    await pool.query('select 1')
    return { ok: true }
  })

  await app.register(authRoutes, { pool, mailer: mailer ?? devMailer(app.log), appOrigin, secureCookies: appOrigin.startsWith('https://') })
  await app.register(dataRoutes, { pool, catalog })

  return app
}
