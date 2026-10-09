import { useAuth } from '../../auth/authContext'
import './EmailVerificationNotice.css'

export function EmailVerificationNotice() {
  const { user } = useAuth()
  if (!user || user.emailVerified) return null
  return (
    <p className="email-verification-notice" role="note">
      <strong>E-mail não verificado.</strong> Abra o link que enviamos para {user.email}: a confirmação é necessária para aceitar convites.
    </p>
  )
}
