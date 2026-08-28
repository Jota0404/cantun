import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { syncEngine } from '../sync/syncService'
import { AuthContext, type AuthContextValue } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!supabase) {
      return
    }

    const client = supabase
    let mounted = true
    const synchronize = (userId: string) => {
      void syncEngine?.bootstrap(userId)
    }

    void client.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session)
        setLoading(false)
        if (data.session) synchronize(data.session.user.id)
      }
    })

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      if (nextSession) synchronize(nextSession.user.id)
    })

    const onOnline = () => {
      void client.auth.getUser().then(({ data: authData }) => {
        if (authData.user) void syncEngine?.sync(authData.user.id)
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
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) throw error
    },
    signOut: async () => {
      if (!supabase) return
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
    },
  }), [loading, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
