import { createContext, useContext } from 'react'
import type { AuthUser } from '../platform/auth'
import type { DeleteMyAccountResult } from '../application/privacy/deleteMyAccount'
import type { RecordConsentResult } from '../application/privacy/recordConsent'
import type { SignOutOptions } from './localSession'

export type ReauthResult = { success: true } | { success: false; reason: 'wrong_password' | 'session_expired' | 'network' }

export interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  configured: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, displayName: string) => Promise<void>
  /** Lança `PendingLocalChangesError` se houver alterações não sincronizadas e `discardPendingChanges` não for informado. */
  signOut: (options?: SignOutOptions) => Promise<void>
  /** Exclui a conta no servidor e, só em caso de sucesso, apaga os dados locais e encerra a sessão (ADR-063). */
  deleteAccount: () => Promise<DeleteMyAccountResult>
  /** Confirma a senha por 5 min para ações destrutivas (ADR-065). Nunca lança. */
  reauth: (password: string) => Promise<ReauthResult>
  /** Registra o aceite da versão vigente de Política e Termos (D7) e atualiza `user.consentRequired`. */
  acceptConsent: () => Promise<RecordConsentResult>
  /** Reconsulta a sessão no servidor; 401 deixa `user = null`. Sem rede, mantém o usuário. */
  refresh: () => Promise<void>
  /** Confirma o token do link de verificação e atualiza `user.emailVerified`. Lança `ApiError` se o token for inválido. */
  verifyEmail: (token: string) => Promise<void>
  /** Reenvia o e-mail de verificação do usuário logado. */
  resendVerification: () => Promise<void>
  /** Sempre resolve (o servidor não revela se a conta existe). */
  requestPasswordReset: (email: string) => Promise<void>
  /** Troca a senha; o servidor derruba todas as sessões, então `user` vira `null`. */
  confirmPasswordReset: (token: string, password: string) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider.')
  return context
}
