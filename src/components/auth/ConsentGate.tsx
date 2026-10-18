import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import './ConsentGate.css'

/** D7: a Política/os Termos mudaram desde o último aceite; sem novo aceite o app não abre. */
export function ConsentGate() {
  const { acceptConsent, signOut } = useAuth()
  const [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: { preventDefault: () => void }) {
    event.preventDefault()
    setError('')
    setBusy(true)
    const result = await acceptConsent().finally(() => setBusy(false))
    if (!result.success) setError(result.errors[0])
  }

  return (
    <main className="consent-gate">
      <h1>Atualizamos a Política e os Termos</h1>
      <p>Para continuar usando o CANTUM, leia e aceite a nova versão.</p>
      <form onSubmit={(event) => void submit(event)}>
        <label className="consent-gate__check">
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} required />
          <span>Li e aceito a <Link to="/privacidade">Política de Privacidade</Link> e os <Link to="/termos">Termos de Uso</Link></span>
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={!accepted || busy}>{busy ? 'Registrando…' : 'Aceitar e continuar'}</button>
      </form>
      <button type="button" className="consent-gate__leave" onClick={() => void signOut().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Não foi possível sair.'))}>Sair</button>
    </main>
  )
}
