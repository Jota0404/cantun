// Cliente HTTP do servidor próprio (ADR-059). A sessão vive no cookie `HttpOnly`
// `cantum_session`, então toda chamada usa `credentials: 'include'`.
// Front e API precisam estar no mesmo site: em dev, `localhost:5173` + `localhost:8787`
// (não misture com `127.0.0.1`, que é outro site para o navegador).
const configuredUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim()

// Sem padrão nos testes: o remoto é sempre mockado (`src/platform`).
const devDefaultUrl = import.meta.env.DEV && import.meta.env.MODE !== 'test' ? 'http://localhost:8787' : ''

export const apiUrl = (configuredUrl || devDefaultUrl).replace(/\/+$/, '')

export const isPlatformConfigured = Boolean(apiUrl)

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

/** Lança `ApiError` para respostas não-2xx; erros de rede propagam como vêm do `fetch`. */
export async function apiRequest<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  if (!isPlatformConfigured) throw new ApiError(0, 'Servidor não configurado.')
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: unknown } | null
    throw new ApiError(response.status, typeof data?.error === 'string' ? data.error : `Erro ${response.status} do servidor.`)
  }
  if (response.status === 204) return undefined as T
  return await response.json() as T
}
