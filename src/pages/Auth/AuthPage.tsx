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

  if (loading) return <main><p>Carregando sessão…</p></main>
  if (user) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/songs'} replace />

  if (!configured) {
    return (
      <main>
        <h1>Autenticação</h1>
        <p>O Supabase ainda não está configurado neste ambiente.</p>
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
        navigate('/songs', { replace: true })
      } else {
        await signUp(email, password)
        setMessage('Conta criada. Verifique seu e-mail para confirmar o acesso.')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.')
    }
  }

  return (
    <main>
      <h1>{mode === 'login' ? 'Entrar' : 'Criar conta'}</h1>
      <form onSubmit={submit}>
        <label>
          E-mail
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          Senha
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} />
        </label>
        <button type="submit">{mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
      </form>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
        {mode === 'login' ? 'Criar uma conta' : 'Já tenho uma conta'}
      </button>
    </main>
  )
}
