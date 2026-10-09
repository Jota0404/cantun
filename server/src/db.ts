import pg from 'pg'

export type Pool = pg.Pool
export type Client = pg.PoolClient

export function createPool(config: pg.PoolConfig = {}): Pool {
  return new pg.Pool(config)
}

/**
 * Transação de uma requisição: papel e usuário locais à transação.
 * Quem decide o acesso é a RLS e as funções do banco (ADR-049, ADR-059).
 */
export async function asUser<T>(pool: Pool, userId: string | null, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(userId ? 'set local role cantum_user' : 'set local role cantum_anon')
    await client.query("select set_config('app.user_id', $1, true)", [userId ?? ''])
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Traduz erros do PostgreSQL sem vazar detalhes internos. */
export function fromPgError(error: unknown): HttpError | null {
  const code = (error as { code?: unknown }).code
  if (typeof code !== 'string') return null
  if (code === '42501') return new HttpError(403, 'acesso negado')
  if (code === 'P0001') return new HttpError(400, (error as Error).message)
  if (code.startsWith('23')) return new HttpError(409, 'conflito de dados')
  if (code.startsWith('22')) return new HttpError(400, 'dados inválidos')
  if (code === '42883' || code === '42703') return new HttpError(400, 'parâmetros inválidos')
  return null
}
