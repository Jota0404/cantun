import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'

export function AuthPage() {
  const { user, loading, configured, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const destination = (location.state as { from?: string } | null)?.from ?? '/songs'

  if (loading) return <main className="auth-page"><p>Carregando sessão…</p></main>
  if (user) return <Navigate to={destination} replace />

  if (!configured) {
    return (
      <main className="auth-page">
        <section className="auth-card" aria-labelledby="auth-title">
          <p className="auth-card__eyebrow">MUSIC WORKSPACE</p>
          <h1 id="auth-title">CANTUM</h1>
          <p className="auth-card__subtitle">Autenticação</p>
          <p>O Supabase ainda não está configurado neste ambiente.</p>
        </section>
      </main>
    )
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setMessage('')
    setError('')
    try {
      if (mode === 'login') {
        await signIn(email, password)
        navigate(destination, { replace: true })
      } else {
        await signUp(email, password)
        setMessage('Conta criada. Verifique seu e-mail para confirmar o acesso.')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.')
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="auth-card__eyebrow">MUSIC WORKSPACE</p>
        <h1 id="auth-title">CANTUM</h1>
        <p className="auth-card__subtitle">
          {mode === 'login' ? 'Entre para acessar suas músicas.' : 'Crie sua conta para começar.'}
        </p>
        <form className="auth-form" onSubmit={submit}>
          <label>
            E-mail
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          </label>
          <label>
            Senha
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={6} />
          </label>
          <button className="auth-form__submit" type="submit">{mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
        </form>
        {message && <p className="auth-message" role="status">{message}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-switch" type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(''); setError('') }}>
          {mode === 'login' ? 'Ainda não tenho uma conta' : 'Já tenho uma conta'}
        </button>
      </section>
    </main>
  )
}
