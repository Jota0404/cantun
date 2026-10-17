import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import { PendingLocalChangesError } from '../../auth/localSession'
import { exportMyData } from '../../application/privacy/exportMyData'
import { getInitialTheme, saveTheme, type Theme } from '../../theme'
import './NavigationPages.css'

// Apêndice B. Tarefa: acessar o que não é do dia a dia. Prioridade: Repertórios e configurações.
// Ação óbvia: Sair. Ensaios (B6) e Histórico (B7) ficam escondidos até existirem (RN-01).
export function MorePage() {
  const { signOut } = useAuth()
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [error, setError] = useState('')

  async function handleSignOut() {
    setError('')
    try {
      await signOut()
    } catch (cause) {
      if (!(cause instanceof PendingLocalChangesError)) {
        setError(cause instanceof Error ? cause.message : 'Não foi possível sair.')
        return
      }
      const discard = window.confirm(
        `Há ${cause.pendingCount} alteração(ões) feitas neste aparelho que ainda não foram sincronizadas. ` +
        'Se sair agora, elas serão descartadas. Conecte-se à internet para sincronizar antes de sair.\n\nSair mesmo assim?',
      )
      if (!discard) return
      try {
        await signOut({ discardPendingChanges: true })
      } catch (retryCause) {
        setError(retryCause instanceof Error ? retryCause.message : 'Não foi possível sair.')
      }
    }
  }

  async function handleExport() {
    setError('')
    const result = await exportMyData()
    if (!result.success) {
      setError(result.errors[0])
      return
    }
    const url = URL.createObjectURL(new Blob([result.json], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = result.filename
    link.click()
    URL.revokeObjectURL(url)
  }

  function toggleTheme() {
    const next: Theme = theme === 'light' ? 'dark' : 'light'
    saveTheme(next)
    setTheme(next)
  }

  return (
    <main className="nav-page">
      <h2>Mais</h2>
      <ul className="nav-page__list">
        <li><Link to="/repertoires">Repertórios</Link></li>
      </ul>
      <section aria-labelledby="settings-title">
        <h3 id="settings-title">Configurações</h3>
        <button type="button" onClick={toggleTheme}>{theme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro'}</button>
        <p>Tema atual: {theme === 'light' ? 'claro' : 'escuro'}.</p>
      </section>
      <section aria-labelledby="privacy-title">
        <h3 id="privacy-title">Privacidade</h3>
        <button type="button" onClick={() => void handleExport()}>Exportar meus dados</button>
      </section>
      {error && <p role="alert" className="organization-error">{error}</p>}
      <button type="button" onClick={() => void handleSignOut()}>Sair</button>
    </main>
  )
}
