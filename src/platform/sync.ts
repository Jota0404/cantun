import { apiRequest } from './http'

/** Filtros de igualdade por coluna (`?id=…&user_id=…`). */
export type RowFilters = Record<string, string>
export type RemoteRow = Record<string, unknown>

function path(table: string, filters?: RowFilters) {
  const query = filters && Object.keys(filters).length ? `?${new URLSearchParams(filters)}` : ''
  return `/sync/${encodeURIComponent(table)}${query}`
}

export function selectRows<T = RemoteRow>(table: string, filters?: RowFilters): Promise<T[]> {
  return apiRequest<T[]>('GET', path(table, filters))
}

/** Upsert pela chave primária da tabela. */
export function upsertRows(table: string, rows: RemoteRow[]): Promise<{ count: number }> {
  return apiRequest('POST', path(table), { rows })
}

export function updateRows(table: string, filters: RowFilters, values: RemoteRow): Promise<{ count: number }> {
  return apiRequest('PATCH', path(table, filters), { values })
}

export function deleteRows(table: string, filters: RowFilters): Promise<{ count: number }> {
  return apiRequest('DELETE', path(table, filters))
}
