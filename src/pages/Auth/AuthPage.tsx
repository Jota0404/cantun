import { FormEvent, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'

export function AuthPage() {
  const { user, loading, configured, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  if (loading) return <main><p>Carregando sessão…</p></main>
  if (user) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/songs'} replace />

  if (!configured) {
    return (
      <main>
        <h2>Conta CANTUM</h2>
        <p>Autenticação ainda não está configurada neste ambiente.</p>
      </main>
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    try {
      if (mode === 'login') {
        await signIn(email, password)
        navigate('/songs', { replace: true })
      } else {
        await signUp(email, password)
        setMessage('Conta criada. Verifique seu e-mail se a confirmação estiver habilitada.')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.')
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: '3rem auto', padding: '1rem' }}>
      <h2>{mode === 'login' ? 'Entrar no CANTUM' : 'Criar conta'}</h2>
      <p>Suas músicas e repertórios poderão ser sincronizados entre dispositivos.</p>
      <form onSubmit={submit}>
        <label>
          E-mail
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
        </label>
        <label>
          Senha
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </label>
        <button type="submit">{mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
      </form>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => setMode((current) => current === 'login' ? 'signup' : 'login')}>
        {mode === 'login' ? 'Ainda não tenho conta' : 'Já tenho conta'}
      </button>
    </main>
  )
}
