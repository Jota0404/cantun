/**
 * Versão vigente de Política e Termos (VS-07 RN-01). Espelha `app.current_consent_version()` no SQL;
 * `consent.test.ts` falha se divergirem. Subir a versão: nova migration + esta constante + os textos em docs/privacy.
 */
export const CONSENT_VERSION = '2026-10-17'

export type ConsentDocument = 'privacy' | 'terms'

export const CONSENT_DOCUMENTS: readonly ConsentDocument[] = ['privacy', 'terms']
