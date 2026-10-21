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
  clearCurrentUser: vi.fn(),
  verifyEmail: vi.fn(),
  requestPasswordReset: vi.fn(),
  resendVerification: vi.fn(),
  reauth: vi.fn(),
  confirmPasswordReset: vi.fn(),
}))
vi.mock('../platform/auth', () => auth)
vi.mock('../platform/http', () => ({ isPlatformConfigured: true }))
const realtime = vi.hoisted(() => ({ onSessionExpired: null as (() => void) | null }))
vi.mock('../platform/realtime', () => ({ realtime }))
const engines = vi.hoisted(() => ({
  syncEngine: { bootstrap: vi.fn(), sync: vi.fn(), start: vi.fn(), stop: vi.fn(async () => undefined) },
  targetSyncEngine: { start: vi.fn(), stop: vi.fn(async () => undefined) },
}))
vi.mock('../sync/syncService', () => ({ ...engines, syncTargetDomain: vi.fn() }))

const deleteMyAccount = vi.hoisted(() => vi.fn())
vi.mock('../application/privacy/deleteMyAccount', () => ({ deleteMyAccount }))

const recordConsent = vi.hoisted(() => vi.fn())
vi.mock('../application/privacy/recordConsent', () => ({ recordConsent }))

import { db } from '../db/database'
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

  it('acceptConsent refreshes the session only after the consent is recorded', async () => {
    const { result } = await renderAuth()
    const pending = { ...unverified, consentRequired: true }
    auth.getSession.mockResolvedValue(pending)
    await act(() => result.current.refresh())
    expect(result.current.user?.consentRequired).toBe(true)

    recordConsent.mockResolvedValueOnce({ success: false, errors: ['Sem conexão'] })
    auth.getSession.mockClear()
    await act(async () => { expect(await result.current.acceptConsent()).toEqual({ success: false, errors: ['Sem conexão'] }) })
    expect(auth.getSession).not.toHaveBeenCalled()
    expect(result.current.user?.consentRequired).toBe(true)

    recordConsent.mockResolvedValueOnce({ success: true })
    auth.getSession.mockResolvedValue({ ...pending, consentRequired: false })
    await act(() => result.current.acceptConsent())
    expect(result.current.user?.consentRequired).toBe(false)
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

 it('deleteAccount wipes local data despite pending changes and ends the session', async () => {
    const { result } = await renderAuth()
    await db.syncQueue.add({ userId: 'user-1', entity: 'song', entityId: 's1', operation: 'upsert', updatedAt: 'x' } as never)
    deleteMyAccount.mockResolvedValueOnce({ success: true })
    auth.signOut.mockRejectedValueOnce(new Error('401'))

    await act(async () => { await result.current.deleteAccount() })

    expect(await db.syncQueue.count()).toBe(0)
    expect(result.current.user).toBeNull()
    expect(auth.clearCurrentUser).toHaveBeenCalled()
    const stopOrder = engines.syncEngine.stop.mock.invocationCallOrder[0]
    expect(stopOrder).toBeLessThan(auth.signOut.mock.invocationCallOrder[0])
    expect(engines.targetSyncEngine.stop).toHaveBeenCalled()
  })

  it('deleteAccount keeps everything when the server refuses', async () => {
    const { result } = await renderAuth()
    deleteMyAccount.mockResolvedValueOnce({ success: false, errors: ['x'] })
    await act(async () => { await result.current.deleteAccount() })
    expect(result.current.user).toEqual(unverified)
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('reauth delegates to the server', async () => {
    const { result } = await renderAuth()
    await act(() => result.current.reauth('password1'))
    expect(auth.reauth).toHaveBeenCalledWith('password1')
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
