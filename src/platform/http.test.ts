import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadHttp() {
  vi.resetModules()
  vi.stubEnv('VITE_API_URL', 'http://localhost:8787/')
  return import('./http')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('apiRequest', () => {
  it('sends JSON with the session cookie to the configured API', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { apiRequest } = await loadHttp()

    await expect(apiRequest('POST', '/rpc/x', { p_id: '1' })).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8787/rpc/x', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{"p_id":"1"}',
    })
  })

  it('returns undefined on 204 and throws ApiError with the server message', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'acesso negado' }), { status: 403 })))
    const { apiRequest, ApiError } = await loadHttp()

    await expect(apiRequest('POST', '/auth/logout')).resolves.toBeUndefined()
    const error = await apiRequest('GET', '/sync/songs').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 403, message: 'acesso negado' })
  })

  it('is not configured in tests without VITE_API_URL', async () => {
    vi.resetModules()
    const { isPlatformConfigured, apiRequest } = await import('./http')
    expect(isPlatformConfigured).toBe(false)
    await expect(apiRequest('GET', '/health')).rejects.toMatchObject({ status: 0 })
  })
})
