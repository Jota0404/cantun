import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { db } from '../db/database'
import * as platformAuth from '../platform/auth'
import type { AuthUser } from '../platform/auth'
import { isPlatformConfigured } from '../platform/http'
import { syncEngine, syncTargetDomain } from '../sync/syncService'
import { AuthContext, type AuthContextValue } from './authContext'
import { ensureLocalDataOwner, signOutWithLocalCleanup } from './localSession'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => platformAuth.getCurrentUser())
  const [loading, setLoading] = useState(isPlatformConfigured)
  const mounted = useRef(true)
  const currentUserId = useRef(user?.id ?? null)

  // Os dados locais precisam pertencer ao usuário da sessão ANTES de a UI ler
  // ou de a sincronização enviar qualquer coisa (Blueprint §50.3, ADR-048).
  const applyUser = useCallback(async (nextUser: AuthUser | null) => {
    if (nextUser) {
      try {
        await ensureLocalDataOwner(db, nextUser.id)
      } catch {
        // Falha no IndexedDB não deve bloquear o login; a sincronização segue normalmente.
      }
    }
    if (!mounted.current) return
    currentUserId.current = nextUser?.id ?? null
    setUser(nextUser)
    setLoading(false)
    if (nextUser) void syncEngine?.bootstrap(nextUser.id)
  }, [])

  useEffect(() => {
    mounted.current = true
    if (!isPlatformConfigured) return
    void platformAuth.getSession().then(applyUser)

    const onOnline = () => {
      void platformAuth.getSession().then((sessionUser) => {
        if (sessionUser) void syncEngine?.sync(sessionUser.id)
        else void applyUser(null)
      })
    }

    window.addEventListener('online', onOnline)
    return () => {
      mounted.current = false
      window.removeEventListener('online', onOnline)
    }
  }, [applyUser])

  // Mesmo usuário: só atualiza os dados (ex.: `emailVerified`), sem refazer isolamento e bootstrap.
  const refresh = useCallback(async () => {
    const nextUser = await platformAuth.getSession()
    if (nextUser && nextUser.id === currentUserId.current) {
      if (mounted.current) setUser(nextUser)
    } else {
      await applyUser(nextUser)
    }
  }, [applyUser])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    configured: isPlatformConfigured,
    signIn: async (email, password) => {
      const nextUser = await platformAuth.signIn(email, password)
      if (nextUser.id !== user?.id) setLoading(true)
      await applyUser(nextUser)
    },
    signUp: async (email, password) => {
      await applyUser(await platformAuth.signUp(email, password))
    },
    signOut: async (options) => {
      if (!isPlatformConfigured) return
      const userId = user?.id ?? null
      await signOutWithLocalCleanup({
        db,
        flushPendingChanges: async () => {
          if (!userId || !navigator.onLine) return
          await Promise.allSettled([syncEngine?.sync(userId), syncTargetDomain()])
        },
        signOutRemote: platformAuth.signOut,
      }, options)
      currentUserId.current = null
      setUser(null)
    },
    refresh,
    verifyEmail: async (token) => {
      await platformAuth.verifyEmail(token)
      await refresh()
    },
    requestPasswordReset: platformAuth.requestPasswordReset,
    confirmPasswordReset: async (token, password) => {
      await platformAuth.confirmPasswordReset(token, password)
      await refresh()
    },
  }), [applyUser, loading, refresh, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
