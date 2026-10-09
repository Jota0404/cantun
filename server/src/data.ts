import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Catalog, Table } from './catalog.ts'
import { ident } from './catalog.ts'
import type { Pool } from './db.ts'
import { asUser, HttpError } from './db.ts'

const MAX_ROWS = 500

function requireUser(request: FastifyRequest): string {
  if (!request.userId) throw new HttpError(401, 'sessão inválida')
  return request.userId
}

function toParam(value: unknown, type: string): unknown {
  if (type === 'json' || type === 'jsonb') return JSON.stringify(value)
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) throw new HttpError(400, 'dados inválidos')
  return value
}

function getTable(catalog: Catalog, name: string): Table {
  const table = catalog.tables.get(name)
  if (!table) throw new HttpError(404, 'tabela não encontrada')
  return table
}

function columnType(table: Table, column: string): string {
  const type = table.columns.get(column)
  if (!type) throw new HttpError(400, `coluna desconhecida: ${column}`)
  return type
}

/** Filtros de igualdade vindos da query string: `?id=…&user_id=…`. */
function whereClause(table: Table, filters: Record<string, string>, params: unknown[]): string {
  const parts = Object.entries(filters).map(([column, value]) => {
    params.push(value)
    return `${ident(column)} = $${params.length}::${columnType(table, column)}`
  })
  return parts.length ? `where ${parts.join(' and ')}` : ''
}

export interface DataOptions {
  pool: Pool
  catalog: Catalog
}

export async function dataRoutes(app: FastifyInstance, { pool, catalog }: DataOptions) {
  app.post<{ Params: { name: string }; Body: Record<string, unknown> | undefined }>('/rpc/:name', async (request, reply) => {
    const userId = requireUser(request)
    const fn = catalog.functions.get(request.params.name)
    if (!fn) throw new HttpError(404, 'função não encontrada')

    const body = request.body ?? {}
    if (typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'dados inválidos')
    const params: unknown[] = []
    const args = Object.entries(body).map(([name, value]) => {
      const arg = fn.args.find((a) => a.name === name)
      if (!arg) throw new HttpError(400, `parâmetro desconhecido: ${name}`)
      params.push(toParam(value, arg.type))
      return `${ident(name)} => $${params.length}::${arg.type}`
    })

    const { rows } = await asUser(pool, userId, (client) =>
      client.query(`select * from public.${ident(fn.name)}(${args.join(', ')})`, params),
    )
    if (fn.returns === 'void') return null
    if (fn.returns === 'row') return fn.returnsSet ? rows : (rows[0] ?? null)
    const values = rows.map((row) => row[fn.name])
    if (fn.returnsSet) return values
    // Fastify envia string crua como text/plain; o contrato é JSON.
    return reply.type('application/json; charset=utf-8').send(JSON.stringify(values[0] ?? null))
  })

  app.get<{ Params: { table: string }; Querystring: Record<string, string> }>('/sync/:table', async (request) => {
    const userId = requireUser(request)
    const table = getTable(catalog, request.params.table)
    const params: unknown[] = []
    const where = whereClause(table, request.query, params)
    const { rows } = await asUser(pool, userId, (client) => client.query(`select * from public.${ident(table.name)} ${where}`, params))
    return rows
  })

  app.post<{ Params: { table: string }; Body: { rows: Record<string, unknown>[] } }>('/sync/:table', {
    schema: { body: { type: 'object', required: ['rows'], additionalProperties: false, properties: { rows: { type: 'array', minItems: 1, maxItems: MAX_ROWS, items: { type: 'object' } } } } },
  }, async (request) => {
    const userId = requireUser(request)
    const table = getTable(catalog, request.params.table)
    const count = await asUser(pool, userId, async (client) => {
      let total = 0
      for (const row of request.body.rows) {
        const columns = Object.keys(row)
        if (!table.primaryKey.every((key) => columns.includes(key))) throw new HttpError(400, 'chave primária ausente')
        const params = columns.map((column) => toParam(row[column], columnType(table, column)))
        const values = columns.map((column, i) => `$${i + 1}::${columnType(table, column)}`)
        const updates = columns.filter((c) => !table.primaryKey.includes(c)).map((c) => `${ident(c)} = excluded.${ident(c)}`)
        const conflict = `on conflict (${table.primaryKey.map(ident).join(', ')}) ${updates.length ? `do update set ${updates.join(', ')}` : 'do nothing'}`
        const result = await client.query(
          `insert into public.${ident(table.name)} (${columns.map(ident).join(', ')}) values (${values.join(', ')}) ${conflict}`,
          params,
        )
        total += result.rowCount ?? 0
      }
      return total
    })
    return { count }
  })

  app.patch<{ Params: { table: string }; Querystring: Record<string, string>; Body: { values: Record<string, unknown> } }>('/sync/:table', {
    schema: { body: { type: 'object', required: ['values'], additionalProperties: false, properties: { values: { type: 'object', minProperties: 1 } } } },
  }, async (request) => {
    const userId = requireUser(request)
    const table = getTable(catalog, request.params.table)
    if (!Object.keys(request.query).length) throw new HttpError(400, 'filtro obrigatório')
    const params: unknown[] = []
    const sets = Object.entries(request.body.values).map(([column, value]) => {
      params.push(toParam(value, columnType(table, column)))
      return `${ident(column)} = $${params.length}::${columnType(table, column)}`
    })
    const where = whereClause(table, request.query, params)
    const result = await asUser(pool, userId, (client) => client.query(`update public.${ident(table.name)} set ${sets.join(', ')} ${where}`, params))
    return { count: result.rowCount ?? 0 }
  })

  app.delete<{ Params: { table: string }; Querystring: Record<string, string> }>('/sync/:table', async (request) => {
    const userId = requireUser(request)
    const table = getTable(catalog, request.params.table)
    if (!Object.keys(request.query).length) throw new HttpError(400, 'filtro obrigatório')
    const params: unknown[] = []
    const where = whereClause(table, request.query, params)
    const result = await asUser(pool, userId, (client) => client.query(`delete from public.${ident(table.name)} ${where}`, params))
    return { count: result.rowCount ?? 0 }
  })
}
