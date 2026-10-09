import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/authContext'
import './EmailVerificationNotice.css'

const RESEND_COOLDOWN_MS = 60_000

export function EmailVerificationNotice() {
  const { user, resendVerification } = useAuth()
  const [coolingDown, setCoolingDown] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!coolingDown) return
    const timer = window.setTimeout(() => setCoolingDown(false), RESEND_COOLDOWN_MS)
    return () => window.clearTimeout(timer)
  }, [coolingDown])

  if (!user || user.emailVerified) return null

  const resend = async () => {
    setCoolingDown(true)
    try {
      await resendVerification()
      setMessage('Se for possível, enviamos um novo link.')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Não foi possível reenviar o e-mail.')
    }
  }

  return (
    <div className="email-verification-notice" role="note">
      <p><strong>E-mail não verificado.</strong> Abra o link que enviamos para {user.email}: a confirmação é necessária para aceitar convites.</p>
      <button type="button" onClick={() => void resend()} disabled={coolingDown}>Reenviar e-mail</button>
      {message && <p role="status">{message}</p>}
    </div>
  )
}
