import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import './AuthPage.css'

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setSubmitting(true)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o pedido.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="forgot-password-title">
        <p className="auth-card__eyebrow">MUSIC WORKSPACE</p>
        <h1 id="forgot-password-title">Esqueci a senha</h1>
        <p className="auth-card__subtitle">Informe o e-mail da conta para receber um link de redefinição.</p>
        <form className="auth-form" onSubmit={submit}>
          <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
          <button className="auth-form__submit" type="submit" disabled={submitting}>{submitting ? 'Enviando…' : 'Enviar link'}</button>
        </form>
        {sent && <p className="auth-message" role="status">Se a conta existir, enviamos um link para redefinir a senha.</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <Link className="auth-link" to="/auth">Voltar para o login</Link>
      </section>
    </main>
  )
}
