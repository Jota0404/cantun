import { createContext, useContext } from 'react'
import type { AuthUser } from '../platform/auth'
import type { SignOutOptions } from './localSession'

/**
 * Transição: as páginas do Modo Palco ainda leem `user_metadata` (formato do Supabase).
 * O servidor próprio não envia esse campo; sai quando a UI deixar de usá-lo.
 */
export type AuthContextUser = AuthUser & { user_metadata?: { display_name?: string; name?: string } }

export interface AuthContextValue {
  user: AuthContextUser | null
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
