import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import './AuthPage.css'

type Status = 'verifying' | 'verified' | 'failed'

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const { user, verifyEmail } = useAuth()
  const [status, setStatus] = useState<Status>('verifying')
  const [error, setError] = useState('')
  // O token é de uso único: evita a segunda chamada do StrictMode.
  const requestedToken = useRef('')

  useEffect(() => {
    if (!token || requestedToken.current === token) return
    requestedToken.current = token
    verifyEmail(token)
      .then(() => setStatus('verified'))
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar o e-mail.')
        setStatus('failed')
      })
  }, [token, verifyEmail])

  const failed = !token || status === 'failed'

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="verify-email-title">
        <p className="auth-card__eyebrow">MUSIC WORKSPACE</p>
        <h1 id="verify-email-title">Confirmar e-mail</h1>
        {!failed && status === 'verifying' && <p className="auth-card__subtitle" role="status">Confirmando seu e-mail…</p>}
        {status === 'verified' && <p className="auth-message" role="status">E-mail confirmado. Agora você pode aceitar convites para equipes.</p>}
        {failed && <p className="auth-error" role="alert">{token ? error : 'Link de confirmação inválido: o token não foi informado.'}</p>}
        {status !== 'verifying' || failed
          ? <Link className="auth-link" to={user ? '/' : '/auth'}>{user ? 'Continuar' : 'Ir para o login'}</Link>
          : null}
      </section>
    </main>
  )
}
