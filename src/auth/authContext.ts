import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { SignOutOptions } from './localSession'

export interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  configured: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  /** Lança `PendingLocalChangesError` se houver alterações não sincronizadas e `discardPendingChanges` não for informado. */
  signOut: (options?: SignOutOptions) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider.')
  return context
}
