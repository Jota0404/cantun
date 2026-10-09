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

// Mensagens P0001 do banco (chegam como 400 `{ error }`) traduzidas para a UI.
const SERVER_MESSAGES: Record<string, string> = {
  'authentication required': 'Entre na sua conta para continuar.',
  'display name must have 1 to 80 characters': 'Informe um nome de 1 a 80 caracteres.',
  'invalid invite expiration': 'Validade do convite inválida.',
  'invalid invite role': 'Papel do convite inválido.',
  'invalid invite': 'Convite inválido.',
  'invalid musical function': 'Função musical inválida.',
  'invalid team member status': 'Status de membro inválido.',
  'invalid team role': 'Papel de equipe inválido.',
  'invite already used': 'Este convite já foi usado.',
  'invite expired': 'Este convite expirou.',
  'invite is restricted to another email': 'Este convite é para outro e-mail.',
  'invite requires verified email': 'Confirme seu e-mail antes de aceitar este convite.',
  'invite revoked': 'Este convite foi revogado.',
  'invite without email can only grant member': 'Convite sem e-mail só pode conceder o papel de membro.',
  'not authorized to change musical functions': 'Você não tem permissão para alterar estas funções.',
  'not authorized to change team member status': 'Você não tem permissão para alterar o status deste membro.',
  'not authorized to change team role': 'Você não tem permissão para alterar o papel deste membro.',
  'not authorized to invite organization members': 'Você não tem permissão para convidar pessoas.',
  'repertoire owner and organization cannot change': 'O dono e a organização do repertório não podem mudar.',
  'song owner cannot change': 'O dono da música não pode mudar.',
  'stage session not found or not authorized': 'Sessão de palco não encontrada ou sem acesso.',
  'stage session state not found': 'Estado da sessão de palco não encontrado.',
  'team does not belong to organization': 'A equipe não pertence a esta organização.',
  'team membership not found': 'Membro não encontrado.',
  'team membership role and status change only through RPC': 'Papel e status só mudam pelas ações da equipe.',
}

export function translateServerMessage(message: string): string {
  return SERVER_MESSAGES[message] ?? message
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
    throw new ApiError(response.status, typeof data?.error === 'string' ? translateServerMessage(data.error) : `Erro ${response.status} do servidor.`)
  }
  if (response.status === 204) return undefined as T
  return await response.json() as T
}
