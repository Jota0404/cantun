import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './http'

const apiRequest = vi.hoisted(() => vi.fn())
vi.mock('./http', async (importOriginal) => ({ ...await importOriginal<typeof import('./http')>(), apiRequest }))

const user = { id: 'user-1', email: 'a@example.com', emailVerified: true }

async function loadAuth() {
  vi.resetModules()
  return import('./auth')
}

describe('platform auth', () => {
  beforeEach(() => {
    apiRequest.mockReset()
    const items = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => { items.set(key, value) },
      removeItem: (key: string) => { items.delete(key) },
    })
  })

  it('caches the logged user so the app can open offline', async () => {
    apiRequest.mockResolvedValueOnce({ user })
    const auth = await loadAuth()
    await auth.signIn('a@example.com', 'password1')

    apiRequest.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const reloaded = await loadAuth()
    expect(reloaded.getCurrentUser()).toEqual(user)
    await expect(reloaded.getSession()).resolves.toEqual(user)
  })

  it('clears the user when the server answers 401', async () => {
    apiRequest.mockResolvedValueOnce({ user })
    const auth = await loadAuth()
    await auth.signIn('a@example.com', 'password1')

    apiRequest.mockRejectedValueOnce(new ApiError(401, 'sessão inválida'))
    await expect(auth.getSession()).resolves.toBeNull()
    expect(auth.getCurrentUser()).toBeNull()
  })

  it('keeps the user when logout cannot reach the server', async () => {
    apiRequest.mockResolvedValueOnce({ user })
    const auth = await loadAuth()
    await auth.signIn('a@example.com', 'password1')

    apiRequest.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(auth.signOut()).rejects.toThrow('Failed to fetch')
    expect(auth.getCurrentUser()).toEqual(user)

    apiRequest.mockResolvedValueOnce(undefined)
    await auth.signOut()
    expect(auth.getCurrentUser()).toBeNull()
    expect(apiRequest).toHaveBeenLastCalledWith('POST', '/auth/logout')
  })
})
