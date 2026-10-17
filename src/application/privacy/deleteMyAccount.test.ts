import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../platform/http'
import { deleteMyAccount, SOLE_OWNER_MESSAGE } from './deleteMyAccount'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../platform/rpc', () => ({ rpc }))

describe('deleteMyAccount', () => {
  afterEach(() => rpc.mockReset())

  it('calls the RPC without parameters', async () => {
    rpc.mockResolvedValue(null)
    expect(await deleteMyAccount()).toEqual({ success: true })
    expect(rpc).toHaveBeenCalledWith('delete_my_account')
  })

  it('explains the sole owner block', async () => {
    rpc.mockRejectedValue(new ApiError(400, SOLE_OWNER_MESSAGE))
    expect(await deleteMyAccount()).toEqual({ success: false, errors: [SOLE_OWNER_MESSAGE] })
    expect(SOLE_OWNER_MESSAGE).toMatch(/único Owner/)
  })

  it('hides raw server errors behind a friendly message', async () => {
    rpc.mockRejectedValue(new Error('boom'))
    expect(await deleteMyAccount()).toEqual({ success: false, errors: ['Não foi possível excluir sua conta.'] })
  })
})
