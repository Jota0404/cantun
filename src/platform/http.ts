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
  'position not found or not authorized': 'Vaga não encontrada ou sem permissão.',
  'assignment not found or not authorized': 'Escala não encontrada ou sem permissão.',
  'service is completed or cancelled': 'Serviço encerrado não aceita mudanças na escala.',
  'user is not an active member of the service team': 'Só membros ativos da banda do serviço podem ser escalados.',
  'member already assigned to this position': 'Esta pessoa já está nesta vaga.',
  'position is full': 'A vaga já está completa.',
  'invalid assignment transition': 'Esta mudança não é permitida para o estado atual da escala.',
  'invalid assignment response': 'Resposta inválida.',
  'cannot replace a member with the same member': 'Escolha outra pessoa para substituir.',
  'position quantity is below active assignments': 'A quantidade não pode ficar abaixo das pessoas já escaladas.',
  'position function cannot change with assignments': 'A função não muda enquanto houver pessoas escaladas.',
  'not authorized to create stage sessions': 'Só Owner, Admin e o Líder da banda do serviço podem iniciar o Modo Palco.',
  'repertoire not found or not authorized': 'Repertório pessoal não encontrado.',
  'not authorized to import repertoires into this organization': 'Só quem administra o Ministério ou lidera uma banda importa repertórios.',
  'display name must have 1 to 80 characters': 'Informe um nome de 1 a 80 caracteres.',
  'invalid invite expiration': 'Validade do convite inválida.',
  'invalid invite role': 'Papel do convite inválido.',
  'invalid invite': 'Convite inválido.',
  'invalid musical function': 'Função musical inválida.',
  'invalid team member status': 'Status de membro inválido.',
  'invalid team role': 'Papel na banda inválido.',
  'invite already used': 'Este convite já foi usado.',
  'invite expired': 'Este convite expirou.',
  'invite is restricted to another email': 'Este convite é para outro e-mail.',
  'invite requires verified email': 'Confirme seu e-mail antes de aceitar este convite.',
  'invite revoked': 'Este convite foi revogado.',
  'invite without email can only grant member': 'Convite sem e-mail só pode conceder o papel de membro.',
  'not authorized to invite organization members': 'Você não tem permissão para convidar pessoas.',
  'team does not belong to organization': 'A banda não pertence a este Ministério.',
  'team membership not found': 'Membro não encontrado.',
  'stage session still open': 'Encerre o Palco antes de concluir.',
  'age declaration required': 'Declare ter 16 anos ou mais para criar a conta.',
  'outdated consent version': 'A versão da Política e dos Termos mudou. Recarregue a página e tente de novo.',
  'sole owner of an organization: transfer ownership first': 'Você é o único Owner de um Ministério. Transfira a propriedade antes de excluir a conta.',
}

export function translateServerMessage(message: string): string {
  if (message.startsWith('not authorized to change')) return 'Você não tem permissão para esta ação.'
  return SERVER_MESSAGES[message] ?? message
}

/** Sem headers em 20 s = falha de rede (ApiError 0, retentável). O WebSocket não passa por aqui. */
export const REQUEST_TIMEOUT_MS = 20_000
/** Teto da leitura do corpo (GET /sync grande em rede móvel lenta, exportação): bem maior que o dos headers. */
export const BODY_TIMEOUT_MS = 120_000

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

/** Lança `ApiError` para respostas não-2xx; sem resposta (rede), `ApiError(0)`. */
export async function apiRequest<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  if (!isPlatformConfigured) throw new ApiError(0, 'Servidor não configurado.')
  const controller = new AbortController()
  let timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    let response: Response
    try {
      response = await fetch(`${apiUrl}${path}`, {
        method,
        credentials: 'include',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })
    } catch {
      throw new ApiError(0, 'Sem conexão: tente de novo quando estiver online.')
    }
    // Headers chegaram: o teto passa a valer para a leitura do corpo.
    clearTimeout(timer)
    timer = setTimeout(() => controller.abort(), BODY_TIMEOUT_MS)
    if (!response.ok) {
      const data = await response.json().catch(() => null) as { error?: unknown } | null
      throw new ApiError(response.status, typeof data?.error === 'string' ? translateServerMessage(data.error) : `Erro ${response.status} do servidor.`)
    }
    if (response.status === 204) return undefined as T
    return await response.json() as T
  } catch (error) {
    // Corpo pendurado depois dos headers também estoura o teto: é rede, não erro do servidor.
    if (controller.signal.aborted && !(error instanceof ApiError)) throw new ApiError(0, 'Sem conexão: tente de novo quando estiver online.')
    throw error
  } finally {
    clearTimeout(timer)
  }
}
