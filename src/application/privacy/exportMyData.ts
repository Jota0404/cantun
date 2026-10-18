import { ApiError } from '../../platform/http'
import { rpc } from '../../platform/rpc'

export type ExportMyDataResult = { success: true; json: string; filename: string } | { success: false; errors: string[]; offline?: true }

export const OFFLINE_EXPORT_MESSAGE = 'Sem conexão: conecte-se à internet para exportar seus dados.'

export async function exportMyData(): Promise<ExportMyDataResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { success: false, errors: [OFFLINE_EXPORT_MESSAGE], offline: true }
  try {
    const data = await rpc<unknown>('export_my_data')
    return { success: true, json: JSON.stringify(data, null, 2), filename: `cantum-meus-dados-${new Date().toISOString().slice(0, 10)}.json` }
  } catch (error) {
    // Falha de rede chega como ApiError(0) (platform/http); TypeError cobre um fetch direto.
    if (error instanceof TypeError || (error instanceof ApiError && error.status === 0)) return { success: false, errors: [OFFLINE_EXPORT_MESSAGE], offline: true }
    return { success: false, errors: ['Não foi possível exportar seus dados.'] }
  }
}
