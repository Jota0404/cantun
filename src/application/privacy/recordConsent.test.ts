// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { CONSENT_VERSION } from '../../domain/privacy/consent'
import { recordConsent } from './recordConsent'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../platform/rpc', () => ({ rpc }))

describe('recordConsent', () => {
  afterEach(() => { rpc.mockReset(); vi.restoreAllMocks() })

  it('grava os dois documentos da versão vigente', async () => {
    rpc.mockResolvedValue(undefined)
    expect(await recordConsent()).toEqual({ success: true })
    expect(rpc.mock.calls).toEqual([
      ['record_consent', { p_document: 'privacy', p_version: CONSENT_VERSION }],
      ['record_consent', { p_document: 'terms', p_version: CONSENT_VERSION }],
    ])
  })

  it('offline não chama o servidor', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(await recordConsent()).toMatchObject({ success: false, errors: [expect.stringContaining('Sem conexão')] })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('erro do servidor vira mensagem para tentar de novo', async () => {
    rpc.mockRejectedValue(new Error('boom'))
    expect(await recordConsent()).toMatchObject({ success: false, errors: [expect.stringContaining('Tente novamente')] })
  })
})
