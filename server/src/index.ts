import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildApp } from './app.ts'
import { createPool } from './db.ts'
import { brevoMailer } from './mailer.ts'

const appOrigin = process.env.APP_ORIGIN
if (!appOrigin) throw new Error('APP_ORIGIN é obrigatório (ex.: http://localhost:5173)')

const { BREVO_API_KEY, MAIL_FROM } = process.env
const mailer = BREVO_API_KEY && MAIL_FROM ? brevoMailer({ apiKey: BREVO_API_KEY, from: MAIL_FROM }) : undefined
if (process.env.NODE_ENV === 'production' && !mailer) {
  // O mailer de desenvolvimento registra links com token no log.
  throw new Error('produção exige BREVO_API_KEY e MAIL_FROM (ADR-060)')
}

// Build do front (`npm run build` na raiz): servido na mesma origem da API (ADR-060).
const dist = fileURLToPath(new URL('../../dist', import.meta.url))
const staticRoot = existsSync(`${dist}/index.html`) ? dist : undefined

const pool = createPool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {})
const app = await buildApp({ pool, appOrigin, mailer, staticRoot, trustProxy: Number(process.env.TRUST_PROXY) || 0 })
// Sem este listener, uma conexão ociosa que cai derruba o processo.
pool.on('error', (error) => app.log.error({ err: { message: error.message } }, 'conexão ociosa do pool falhou'))

await app.listen({ port: Number(process.env.PORT ?? 8787), host: process.env.HOST ?? '127.0.0.1' })

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close()
    await pool.end()
  })
}
