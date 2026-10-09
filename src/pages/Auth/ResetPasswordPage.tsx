import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import './AuthPage.css'

export function ResetPasswordPage() {
  const { confirmPasswordReset } = useAuth()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    if (password !== confirmation) { setError('As senhas não conferem.'); return }
    setSubmitting(true)
    try {
      await confirmPasswordReset(token, password)
      navigate('/auth', { replace: true, state: { notice: 'Senha redefinida. Entre novamente com a nova senha.' } })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível redefinir a senha.')
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="reset-password-title">
        <p className="auth-card__eyebrow">MUSIC WORKSPACE</p>
        <h1 id="reset-password-title">Redefinir senha</h1>
        {token ? <>
          <p className="auth-card__subtitle">Ao salvar, você sai de todos os aparelhos e entra de novo com a nova senha.</p>
          <form className="auth-form" onSubmit={submit}>
            <label>Nova senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required minLength={8} maxLength={128} aria-describedby="reset-password-hint" /></label>
            <p id="reset-password-hint" className="auth-hint">De 8 a 128 caracteres.</p>
            <label>Confirmar nova senha<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required minLength={8} maxLength={128} /></label>
            <button className="auth-form__submit" type="submit" disabled={submitting}>{submitting ? 'Salvando…' : 'Salvar nova senha'}</button>
          </form>
        </> : <p className="auth-error" role="alert">Link de redefinição inválido: o token não foi informado.</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <Link className="auth-link" to="/auth/forgot-password">Pedir um novo link</Link>
      </section>
    </main>
  )
}
