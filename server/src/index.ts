import { buildApp } from './app.ts'
import { createPool } from './db.ts'

const appOrigin = process.env.APP_ORIGIN
if (!appOrigin) throw new Error('APP_ORIGIN é obrigatório (ex.: http://localhost:5173)')
if (process.env.NODE_ENV === 'production') {
  // O mailer de desenvolvimento registra links com token no log.
  throw new Error('produção exige um provedor de e-mail configurado (ADR-059)')
}

const pool = createPool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {})
const app = await buildApp({ pool, appOrigin })
// Sem este listener, uma conexão ociosa que cai derruba o processo.
pool.on('error', (error) => app.log.error({ err: { message: error.message } }, 'conexão ociosa do pool falhou'))

await app.listen({ port: Number(process.env.PORT ?? 8787), host: process.env.HOST ?? '127.0.0.1' })

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close()
    await pool.end()
  })
}
