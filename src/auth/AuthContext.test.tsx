import 'fake-indexeddb/auto'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  getCurrentUser: vi.fn(() => null),
  getSession: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  verifyEmail: vi.fn(),
  requestPasswordReset: vi.fn(),
  resendVerification: vi.fn(),
  confirmPasswordReset: vi.fn(),
}))
vi.mock('../platform/auth', () => auth)
vi.mock('../platform/http', () => ({ isPlatformConfigured: true }))
const realtime = vi.hoisted(() => ({ onSessionExpired: null as (() => void) | null }))
vi.mock('../platform/realtime', () => ({ realtime }))
vi.mock('../sync/syncService', () => ({ syncEngine: { bootstrap: vi.fn(), sync: vi.fn() }, syncTargetDomain: vi.fn() }))

import { AuthProvider } from './AuthContext.tsx'
import { useAuth } from './authContext'

const unverified = { id: 'user-1', email: 'a@example.com', emailVerified: false, displayName: 'Ana' }
const verified = { ...unverified, emailVerified: true }

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

async function renderAuth() {
  const hook = renderHook(() => useAuth(), { wrapper })
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  return hook
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.getSession.mockResolvedValue(unverified)
  })

  it('refresh applies the server session and clears the user on 401', async () => {
    const { result } = await renderAuth()
    expect(result.current.user).toEqual(unverified)

    auth.getSession.mockResolvedValueOnce(null)
    await act(() => result.current.refresh())
    expect(result.current.user).toBeNull()
  })

  it('verifyEmail confirms the token and refreshes emailVerified', async () => {
    const { result } = await renderAuth()
    auth.getSession.mockResolvedValueOnce(verified)

    await act(() => result.current.verifyEmail('token-1'))

    expect(auth.verifyEmail).toHaveBeenCalledWith('token-1')
    expect(result.current.user).toEqual(verified)
  })

  it('verifyEmail rejects without touching the user when the token is invalid', async () => {
    const { result } = await renderAuth()
    auth.verifyEmail.mockRejectedValueOnce(new Error('token inválido'))

    await expect(act(() => result.current.verifyEmail('bad'))).rejects.toThrow('token inválido')
    expect(result.current.user).toEqual(unverified)
  })

  it('confirmPasswordReset leaves the context signed out because every session is revoked', async () => {
    const { result } = await renderAuth()
    auth.getSession.mockResolvedValueOnce(null)

    await act(() => result.current.confirmPasswordReset('token-1', 'nova-senha-123'))

    expect(auth.confirmPasswordReset).toHaveBeenCalledWith('token-1', 'nova-senha-123')
    expect(result.current.user).toBeNull()
  })

  it('signs out when the realtime socket reports an expired session (4401)', async () => {
    const { result, unmount } = await renderAuth()
    auth.getSession.mockResolvedValueOnce(null)

    await act(async () => { realtime.onSessionExpired?.() })

    await waitFor(() => expect(result.current.user).toBeNull())
    unmount()
    expect(realtime.onSessionExpired).toBeNull()
  })

  it('resendVerification delegates to the server', async () => {
    const { result } = await renderAuth()
    await act(() => result.current.resendVerification())
    expect(auth.resendVerification).toHaveBeenCalledTimes(1)
  })

  it('requestPasswordReset delegates to the server', async () => {
    const { result } = await renderAuth()
    await act(() => result.current.requestPasswordReset('a@example.com'))
    expect(auth.requestPasswordReset).toHaveBeenCalledWith('a@example.com')
  })
})
