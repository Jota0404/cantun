import { CONSENT_DOCUMENTS, CONSENT_VERSION } from '../../domain/privacy/consent'
import { rpc } from '../../platform/rpc'

export type RecordConsentResult = { success: true } | { success: false; errors: string[] }

/** Re-aceite da versão vigente (D7): grava os dois documentos; idempotente no banco. Só online. */
export async function recordConsent(): Promise<RecordConsentResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { success: false, errors: ['Sem conexão: conecte-se à internet para aceitar.'] }
  try {
    for (const document of CONSENT_DOCUMENTS) await rpc('record_consent', { p_document: document, p_version: CONSENT_VERSION })
    return { success: true }
  } catch {
    return { success: false, errors: ['Não foi possível registrar o aceite. Tente novamente.'] }
  }
}
