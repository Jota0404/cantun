import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db } from '../db/database'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { syncEngine, syncTargetDomain } from '../sync/syncService'
import { bootstrapBandSync, syncBands } from '../sync/bandSyncService'
import { AuthContext, type AuthContextValue } from './authContext'
import { ensureLocalDataOwner, signOutWithLocalCleanup } from './localSession'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const currentUserId = useRef<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let mounted = true
    const synchronize = (userId: string) => {
      void syncEngine?.bootstrap(userId)
      void bootstrapBandSync()
    }

    // Os dados locais precisam pertencer ao usuário da sessão ANTES de a UI ler
    // ou de a sincronização enviar qualquer coisa (Blueprint §50.3, ADR-048).
    const applySession = async (nextSession: Session | null) => {
      if (nextSession) {
        try {
          await ensureLocalDataOwner(db, nextSession.user.id)
        } catch {
          // Falha no IndexedDB não deve bloquear o login; a sincronização segue normalmente.
        }
      }
      if (!mounted) return
      currentUserId.current = nextSession?.user.id ?? null
      setSession(nextSession)
      setLoading(false)
      if (nextSession) synchronize(nextSession.user.id)
    }

    void client.auth.getSession().then(({ data }) => applySession(data.session))

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return
      if (nextSession && nextSession.user.id !== currentUserId.current) setLoading(true)
      // Não aguardar dentro do callback do Supabase Auth.
      void applySession(nextSession)
    })

    const onOnline = () => {
      void client.auth.getUser().then(({ data: authData }) => {
        if (authData.user) {
          void syncEngine?.sync(authData.user.id)
          void syncBands()
        }
      })
    }

    window.addEventListener('online', onOnline)
    return () => {
      mounted = false
      data.subscription.unsubscribe()
      window.removeEventListener('online', onOnline)
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    configured: isSupabaseConfigured,
    signIn: async (email, password) => {
      if (!supabase) throw new Error('Supabase não está configurado.')
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    },
    signUp: async (email, password) => {
      if (!supabase) throw new Error('Supabase não está configurado.')
      const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } })
      if (error) throw error
    },
    signOut: async (options) => {
      if (!supabase) return
      const client = supabase
      const userId = session?.user.id ?? null
      await signOutWithLocalCleanup({
        db,
        flushPendingChanges: async () => {
          if (!userId || !navigator.onLine) return
          await Promise.allSettled([syncEngine?.sync(userId), syncBands(), syncTargetDomain()])
        },
        signOutRemote: async () => {
          const { error } = await client.auth.signOut({ scope: 'local' })
          if (error) throw error
        },
      }, options)
    },
  }), [loading, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
