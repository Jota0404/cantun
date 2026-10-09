import type { AuthUser } from '../../platform/auth'
import './EmailVerificationNotice.css'

export function EmailVerificationNotice({ user }: { user: AuthUser | null }) {
  if (!user || user.emailVerified) return null
  return (
    <p className="email-verification-notice" role="note">
      <strong>E-mail não verificado.</strong> Abra o link que enviamos para {user.email}: a confirmação é necessária para aceitar convites.
    </p>
  )
}
