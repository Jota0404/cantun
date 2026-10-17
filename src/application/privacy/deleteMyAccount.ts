import { rpc } from '../../platform/rpc'
import { translateServerMessage } from '../../platform/http'

export type DeleteMyAccountResult = { success: true } | { success: false; errors: string[] }

export const SOLE_OWNER_MESSAGE = translateServerMessage('sole owner of an organization: transfer ownership first')

/** Só a chamada remota (ADR-063). Limpeza local e confirmação digitada ficam na UI (fatia 6). */
export async function deleteMyAccount(): Promise<DeleteMyAccountResult> {
  try {
    await rpc('delete_my_account')
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return { success: false, errors: [message === SOLE_OWNER_MESSAGE ? message : 'Não foi possível excluir sua conta.'] }
  }
}
