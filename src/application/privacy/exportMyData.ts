import { rpc } from '../../platform/rpc'

export type ExportMyDataResult = { success: true; json: string; filename: string } | { success: false; errors: string[] }

export const OFFLINE_EXPORT_MESSAGE = 'Sem conexão: conecte-se à internet para exportar seus dados.'

export async function exportMyData(): Promise<ExportMyDataResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { success: false, errors: [OFFLINE_EXPORT_MESSAGE] }
  try {
    const data = await rpc<unknown>('export_my_data')
    return { success: true, json: JSON.stringify(data, null, 2), filename: `cantum-meus-dados-${new Date().toISOString().slice(0, 10)}.json` }
  } catch (error) {
    return { success: false, errors: [error instanceof Error && error.message ? error.message : 'Não foi possível exportar seus dados.'] }
  }
}
