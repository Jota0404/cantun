import { rpc } from '../../platform/rpc'
import { ApiError, translateServerMessage } from '../../platform/http'

/** `reauthRequired`: a janela de reautenticação expirou; a UI pede a senha e tenta de novo (ADR-065). */
export type DeleteMyAccountResult = { success: true } | { success: false; errors: string[]; reauthRequired?: true }

const REAUTH_REQUIRED = 'reauth_required'

export const SOLE_OWNER_MESSAGE = translateServerMessage('sole owner of an organization: transfer ownership first')

/** Só a chamada remota (ADR-063). Limpeza local e confirmação digitada ficam na UI (fatia 6). */
export async function deleteMyAccount(): Promise<DeleteMyAccountResult> {
  try {
    await rpc('delete_my_account')
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (error instanceof ApiError && error.status === 403 && message === REAUTH_REQUIRED) {
      return { success: false, errors: ['Confirme sua senha para excluir a conta.'], reauthRequired: true }
    }
    return { success: false, errors: [message === SOLE_OWNER_MESSAGE ? message : 'Não foi possível excluir sua conta.'] }
  }
}
