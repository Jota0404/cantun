import { ApiError, apiRequest } from './http'

export interface AuthUser {
  id: string
  email: string
  emailVerified: boolean
}

// Último usuário autenticado, para o app abrir offline (local-first, ADR-048).
// O cookie continua sendo a credencial; isto é só cache de identidade.
const AUTH_USER_KEY = 'cantum-auth-user'

function readCachedUser(): AuthUser | null {
  try {
    const raw = window.localStorage.getItem(AUTH_USER_KEY)
    return raw ? JSON.parse(raw) as AuthUser : null
  } catch {
    return null
  }
}

let currentUser: AuthUser | null = typeof window === 'undefined' ? null : readCachedUser()

function setCurrentUser(user: AuthUser | null): AuthUser | null {
  currentUser = user
  try {
    if (user) window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
    else window.localStorage.removeItem(AUTH_USER_KEY)
  } catch {
    // Storage indisponível: segue só em memória.
  }
  return user
}

/** Usuário conhecido localmente, sem rede. */
export function getCurrentUser(): AuthUser | null {
  return currentUser
}

/** Confirma a sessão no servidor. 401 limpa o usuário; sem rede, mantém o último conhecido. */
export async function getSession(): Promise<AuthUser | null> {
  try {
    const { user } = await apiRequest<{ user: AuthUser }>('GET', '/auth/session')
    return setCurrentUser(user)
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return setCurrentUser(null)
    return currentUser
  }
}

async function authenticate(path: string, email: string, password: string): Promise<AuthUser> {
  const { user } = await apiRequest<{ user: AuthUser }>('POST', path, { email, password })
  setCurrentUser(user)
  return user
}

export const signUp = (email: string, password: string): Promise<AuthUser> => authenticate('/auth/signup', email, password)

export const signIn = (email: string, password: string): Promise<AuthUser> => authenticate('/auth/login', email, password)

/** Revoga a sessão no servidor. Sem rede, lança e mantém o usuário (o cookie continuaria válido). */
export async function signOut(): Promise<void> {
  try {
    await apiRequest<void>('POST', '/auth/logout')
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) throw error
  }
  setCurrentUser(null)
}

export function verifyEmail(token: string): Promise<void> {
  return apiRequest('POST', '/auth/verify-email', { token })
}

/** Reenvia o link de verificação do usuário logado; o servidor sempre responde 204. */
export function resendVerification(): Promise<void> {
  return apiRequest('POST', '/auth/verify-email/resend')
}

/** O servidor sempre responde 204, exista ou não a conta. */
export function requestPasswordReset(email: string): Promise<void> {
  return apiRequest('POST', '/auth/password-reset/request', { email })
}

/** Derruba todas as sessões da conta no servidor. */
export async function confirmPasswordReset(token: string, password: string): Promise<void> {
  await apiRequest<void>('POST', '/auth/password-reset/confirm', { token, password })
  setCurrentUser(null)
}
