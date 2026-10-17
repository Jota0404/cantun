import { afterEach, describe, expect, it, vi } from 'vitest'
import { exportMyData, OFFLINE_EXPORT_MESSAGE } from './exportMyData'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../platform/rpc', () => ({ rpc }))

describe('exportMyData', () => {
  afterEach(() => { rpc.mockReset(); vi.restoreAllMocks() })

  it('returns the JSON of the data subject', async () => {
    rpc.mockResolvedValue({ profile: { email: 'a@x.local' } })
    const result = await exportMyData()
    expect(rpc).toHaveBeenCalledWith('export_my_data')
    expect(result).toMatchObject({ success: true, filename: expect.stringMatching(/^cantum-meus-dados-\d{4}-\d{2}-\d{2}\.json$/) })
    expect(result.success && JSON.parse(result.json)).toEqual({ profile: { email: 'a@x.local' } })
  })

  it('fails clearly offline without calling the server', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(await exportMyData()).toEqual({ success: false, errors: [OFFLINE_EXPORT_MESSAGE] })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('reports server errors', async () => {
    rpc.mockRejectedValue(new Error('boom'))
    expect(await exportMyData()).toEqual({ success: false, errors: ['boom'] })
  })
})
