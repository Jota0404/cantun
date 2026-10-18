import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import { PendingLocalChangesError } from '../../auth/localSession'
import { exportMyData } from '../../application/privacy/exportMyData'
import { useOnline } from '../../components/schedule/useOnline'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { labels } from '../../ui/labels'
import { getInitialTheme, saveTheme, type Theme } from '../../theme'
import './NavigationPages.css'

// Apêndice B. Tarefa: acessar o que não é do dia a dia. Prioridade: Repertórios e configurações.
// Ação óbvia: Sair. Ensaios (B6) e Histórico (B7) ficam escondidos até existirem (RN-01).
export function MorePage() {
  const { signOut, deleteAccount } = useAuth()
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [busy, setBusy] = useState(false)
  const online = useOnline()
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState(false)

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
    setExported(false)
    setExporting(true)
    const result = await exportMyData().finally(() => setExporting(false))
    if (!result.success) {
      setError(result.offline ? result.errors[0] : 'Não foi possível exportar seus dados. Tente novamente.')
      return
    }
    const url = URL.createObjectURL(new Blob([result.json], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = result.filename
    link.click()
    URL.revokeObjectURL(url)
    setExported(true)
  }

  // Estável: o ConfirmModal devolve o foco ao Cancelar sempre que onCancel muda.
  const closeDelete = useCallback(() => {
    if (busy) return
    setDeleting(false)
    setConfirmText('')
    setDeleteError('')
  }, [busy])

  async function handleDelete() {
    if (busy) return
    if (!navigator.onLine) {
      setDeleteError('Sem conexão: conecte-se à internet para excluir sua conta.')
      return
    }
    setDeleteError('')
    setBusy(true)
    try {
      const result = await deleteAccount()
      if (result.success) navigate('/auth', { replace: true, state: { notice: 'Conta excluída' } })
      else setDeleteError(result.errors[0])
    } catch {
      setDeleteError('Não foi possível limpar os dados deste aparelho. Tente sair da conta.')
    } finally {
      setBusy(false)
    }
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
        <button type="button" disabled={exporting} onClick={() => void handleExport()}>{exporting ? 'Exportando…' : 'Exportar meus dados'}</button>
        {exported && <p role="status">Arquivo gerado. Confira seus downloads.</p>}
        <button type="button" onClick={() => setDeleting(true)}>Excluir minha conta</button>
      </section>
      <ConfirmModal
        open={deleting}
        title="Excluir minha conta"
        message={`O que você criou para ${labels.organizationDefinite} continua lá, como “Ex-membro”. Seus dados pessoais, vínculos e escalas são apagados agora, inclusive alterações deste aparelho ainda não sincronizadas. Isso não pode ser desfeito.`}
        confirmLabel={busy ? 'Excluindo…' : 'Excluir definitivamente'}
        confirmDisabled={confirmText !== 'EXCLUIR' || busy}
        cancelDisabled={busy}
        onConfirm={() => void handleDelete()}
        onCancel={closeDelete}
      >
        <label>Digite EXCLUIR para confirmar <input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} autoComplete="off" /></label>
        {!online && <p role="alert">Sem conexão: conecte-se à internet para excluir sua conta.</p>}
        {deleteError && online && <p role="alert">{deleteError}</p>}
      </ConfirmModal>
      {error && <p role="alert" className="organization-error">{error}</p>}
      <button type="button" onClick={() => void handleSignOut()}>Sair</button>
    </main>
  )
}
