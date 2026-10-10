import { apiRequest } from './http'

/** `POST /rpc/:name` com parâmetros nomeados (`{ p_id, … }`). */
export function rpc<T = unknown>(name: string, params: Record<string, unknown> = {}): Promise<T> {
  return apiRequest<T>('POST', `/rpc/${encodeURIComponent(name)}`, params)
}
