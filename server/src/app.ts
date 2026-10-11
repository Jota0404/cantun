import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'
import type { FastifyServerOptions } from 'fastify'
import { authRoutes, SESSION_COOKIE, sessionUserId } from './auth.ts'
import { loadCatalog } from './catalog.ts'
import { dataRoutes } from './data.ts'
import type { Pool } from './db.ts'
import { fromPgError, HttpError } from './db.ts'
import type { Mailer } from './mailer.ts'
import { devMailer } from './mailer.ts'
import type { RealtimeOptions } from './realtime.ts'
import { realtimeRoutes } from './realtime.ts'

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
  realtime?: Partial<RealtimeOptions>
  /** Pasta com o build do front (`dist/`): servida na mesma origem da API, com fallback de SPA. */
  staticRoot?: string
  /**
   * Saltos de proxy confiáveis (ex.: 1 no Render). O IP do cliente é o do X-Forwarded-For
   * contado a partir do fim; valores anteriores, que o cliente pode forjar, são ignorados.
   */
  trustProxy?: number
}

// Rotas que consultam a sessão no banco.
const SESSION_PREFIX = /^\/(auth|rpc|sync|realtime|health)(\/|\?|$)/
// Nunca caem no fallback de SPA. `/auth/*` fica de fora: os links dos e-mails
// (`/auth/verify-email?token=…`) são telas do front; as rotas reais de `/auth` respondem antes.
const API_PREFIX = /^\/(rpc|sync|realtime|health)(\/|\?|$)/

const LOG_REDACT = ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]']
// Sem query string no log: os links de e-mail levam o token nela.
const LOG_SERIALIZERS = {
  // `ip` é o IP do cliente já resolvido pelo trust proxy (o mesmo do rate limit);
  // `remoteAddress` é o do socket (o proxy).
  req: (req: { method: string; url: string; ip?: string; socket?: { remoteAddress?: string } }) => ({
    method: req.method, url: req.url.split('?')[0], ip: req.ip, remoteAddress: req.socket?.remoteAddress,
  }),
}

export async function buildApp({ pool, appOrigin, mailer, logger = true, realtime, staticRoot, trustProxy = 0 }: AppOptions) {
  const loggerOptions: FastifyServerOptions['logger'] =
    logger === false ? false : { redact: LOG_REDACT, serializers: LOG_SERIALIZERS, ...(logger === true ? {} : logger) }
  // Confia nos `trustProxy` saltos mais próximos (o que o proxy-addr faz com um número;
  // os tipos do Fastify só aceitam a função).
  const app = Fastify({ trustProxy: (_address: string, hop: number) => hop < trustProxy, logger: loggerOptions })
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
    // Arquivos do front não consultam a sessão no banco.
    if (SESSION_PREFIX.test(request.url)) request.userId = await sessionUserId(pool, request.cookies[SESSION_COOKIE])
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
  await app.register(realtimeRoutes, { pool, appOrigin, options: realtime })

  if (staticRoot) {
    await app.register(fastifyStatic, {
      root: staticRoot,
      // Arquivos com hash do Vite ficam em cache; o resto (index.html, sw.js, manifest) sempre revalida.
      setHeaders: (res, path) => res.header('cache-control', /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache'),
    })
  }
  // Handler próprio mesmo sem front: o padrão do Fastify loga "Route GET:/x?token=… not found", com a query.
  app.setNotFoundHandler((request, reply) => {
    // Arquivo inexistente (com extensão) dá 404, não o index.html no lugar de um .js.
    const path = request.url.split('?')[0]
    if (!staticRoot || request.method !== 'GET' || API_PREFIX.test(path) || /\.[a-z0-9]+$/i.test(path)) {
      return reply.code(404).send({ error: 'não encontrado' })
    }
    return reply.header('cache-control', 'no-cache').sendFile('index.html')
  })


  return app
}
