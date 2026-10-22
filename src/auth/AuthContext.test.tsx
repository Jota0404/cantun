import 'fake-indexeddb/auto'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
vi.mock('../platform/http', async (importOriginal) => ({ ...await importOriginal<typeof import('../platform/http')>(), isPlatformConfigured: true }))
const realtime = vi.hoisted(() => ({ onSessionExpired: null as (() => void) | null }))
vi.mock('../platform/realtime', () => ({ realtime }))
const engines = vi.hoisted(() => ({
  syncEngine: { bootstrap: vi.fn(), sync: vi.fn(), start: vi.fn(), stop: vi.fn(async () => undefined) },
  targetSyncEngine: { start: vi.fn(), stop: vi.fn(async () => undefined) },
}))
const syncTargetDomain = vi.hoisted(() => vi.fn())
vi.mock('../sync/syncService', () => ({ ...engines, syncTargetDomain }))

const periodic = vi.hoisted(() => { const stop = vi.fn(); return { stop, start: vi.fn(() => stop) } })
vi.mock('../sync/periodicPull', () => ({ startPeriodicPull: periodic.start }))

const deleteMyAccount = vi.hoisted(() => vi.fn())
vi.mock('../application/privacy/deleteMyAccount', () => ({ deleteMyAccount }))

const recordConsent = vi.hoisted(() => vi.fn())
vi.mock('../application/privacy/recordConsent', () => ({ recordConsent }))

import { db } from '../db/database'
import { ApiError } from '../platform/http'
import { AuthProvider, SESSION_LOAD_TIMEOUT_MS } from './AuthContext.tsx'
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

  it('stops the engines when the session drops and before another user starts (no run of A survives into B)', async () => {
    const { result } = await renderAuth()
    engines.syncEngine.stop.mockClear()
    engines.syncEngine.start.mockClear()

    auth.getSession.mockResolvedValueOnce(null)
    await act(() => result.current.refresh())
    expect(engines.syncEngine.stop).toHaveBeenCalledTimes(1)
    expect(engines.syncEngine.start).not.toHaveBeenCalled()

    auth.getSession.mockResolvedValueOnce({ ...verified, id: 'user-2' })
    await act(() => result.current.refresh())
    expect(engines.syncEngine.stop.mock.invocationCallOrder[1]).toBeLessThan(engines.syncEngine.start.mock.invocationCallOrder[0])

    engines.syncEngine.stop.mockClear()
    auth.getSession.mockResolvedValueOnce({ ...verified, id: 'user-2' })
    await act(() => result.current.refresh())
    expect(engines.syncEngine.stop).not.toHaveBeenCalled()
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

  it('starts the periodic pull with a session and stops it on sign out', async () => {
    const { result } = await renderAuth()
    expect(periodic.start).toHaveBeenCalledTimes(1)
    await act(async () => { await result.current.signOut() })
    expect(periodic.stop).toHaveBeenCalled()
  })

  it('signOut stops both engines before ending the session and clearing data', async () => {
    const { result } = await renderAuth()
    await act(async () => { await result.current.signOut() })
    expect(engines.targetSyncEngine.stop.mock.invocationCallOrder[0]).toBeLessThan(auth.signOut.mock.invocationCallOrder[0])
    expect(engines.syncEngine.stop.mock.invocationCallOrder[0]).toBeLessThan(auth.signOut.mock.invocationCallOrder[0])
  })

  it('signOut restarts the engines when the remote sign-out fails', async () => {
    const { result } = await renderAuth()
    auth.signOut.mockRejectedValueOnce(new Error('boom'))
    auth.getCurrentUser.mockReturnValue(unverified as never)
    engines.targetSyncEngine.start.mockClear()
    await act(async () => { await result.current.signOut().catch(() => undefined) })
    auth.getCurrentUser.mockReturnValue(null as never)
    expect(engines.targetSyncEngine.start).toHaveBeenCalled()
    expect(syncTargetDomain).toHaveBeenCalled()
    expect(result.current.user).toEqual(unverified)
  })

  it('signOut does not restart the engines when the session already ended (local cleanup failed)', async () => {
    const { result } = await renderAuth()
    auth.signOut.mockResolvedValueOnce(undefined)
    const spy = vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('idb'))
    engines.targetSyncEngine.start.mockClear()
    await act(async () => { await result.current.signOut() })
    spy.mockRestore()
    expect(engines.targetSyncEngine.start).not.toHaveBeenCalled()
    expect(result.current.user).toBeNull()
  })

  it('deleteAccount keeps everything when the server refuses', async () => {
    const { result } = await renderAuth()
    deleteMyAccount.mockResolvedValueOnce({ success: false, errors: ['x'] })
    await act(async () => { await result.current.deleteAccount() })
    expect(result.current.user).toEqual(unverified)
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('reauth succeeds', async () => {
    const { result } = await renderAuth()
    auth.reauth.mockResolvedValueOnce(undefined)
    await expect(act(() => result.current.reauth('password1'))).resolves.toEqual({ success: true })
    expect(auth.reauth).toHaveBeenCalledWith('password1')
  })

  it('reauth maps a wrong password without refreshing', async () => {
    const { result } = await renderAuth()
    const calls = auth.getSession.mock.calls.length
    auth.reauth.mockRejectedValueOnce(new ApiError(401, 'senha incorreta'))
    await expect(act(() => result.current.reauth('x'))).resolves.toEqual({ success: false, reason: 'wrong_password' })
    expect(auth.getSession.mock.calls.length).toBe(calls)
  })

  it('reauth maps an invalid session and re-queries it', async () => {
    const { result } = await renderAuth()
    const calls = auth.getSession.mock.calls.length
    auth.reauth.mockRejectedValueOnce(new ApiError(401, 'sessão inválida'))
    await expect(act(() => result.current.reauth('x'))).resolves.toEqual({ success: false, reason: 'session_expired' })
    expect(auth.getSession.mock.calls.length).toBe(calls + 1)
  })

  it('reauth maps network and server errors', async () => {
    const { result } = await renderAuth()
    auth.reauth.mockRejectedValueOnce(new ApiError(0, 'Sem conexão'))
    await expect(act(() => result.current.reauth('x'))).resolves.toEqual({ success: false, reason: 'network' })
    auth.reauth.mockRejectedValueOnce(new ApiError(500, 'Erro 500 do servidor.'))
    await expect(act(() => result.current.reauth('x'))).resolves.toEqual({ success: false, reason: 'network' })
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

  describe('session load timeout', () => {
    afterEach(() => vi.useRealTimers())

    it('opens with the local user after the timeout and reconciles a late 401', async () => {
      vi.useFakeTimers()
      let resolveLate: (u: null) => void = () => undefined
      auth.getSession.mockReturnValueOnce(new Promise((r) => { resolveLate = r }))
      auth.getCurrentUser.mockReturnValue(unverified as never)
      const hook = renderHook(() => useAuth(), { wrapper })
      expect(hook.result.current.loading).toBe(true)
      await act(() => vi.advanceTimersByTimeAsync(SESSION_LOAD_TIMEOUT_MS))
      expect(hook.result.current.loading).toBe(false)
      expect(hook.result.current.user).toEqual(unverified)
      await act(async () => { resolveLate(null) })
      expect(hook.result.current.user).toBeNull()
      auth.getCurrentUser.mockReturnValue(null as never)
    })

    it('a normal response cancels the timeout', async () => {
      vi.useFakeTimers()
      const hook = renderHook(() => useAuth(), { wrapper })
      await act(async () => { await Promise.resolve() })
      expect(hook.result.current.user).toEqual(unverified)
      expect(vi.getTimerCount()).toBe(0)
    })
  })
})
