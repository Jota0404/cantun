import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import { PendingLocalChangesError } from '../../auth/localSession'
import { exportMyData } from '../../application/privacy/exportMyData'
import { useOnline } from '../../components/schedule/useOnline'
import { Button } from '../../components/ui/Button'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { labels } from '../../ui/labels'
import { getInitialTheme, saveTheme, type Theme } from '../../theme'
import './NavigationPages.css'
import './MorePage.css'

const REAUTH_ERRORS = {
  wrong_password: 'Senha incorreta.',
  session_expired: 'Sua sessão expirou. Entre novamente.',
  network: 'Não foi possível confirmar sua senha. Verifique a conexão e tente novamente.',
}

// Perfil (rota /mais). Tarefa: conta, aparência e privacidade. Ação óbvia: Sair; a exclusão fica à parte, na zona de perigo.
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('')

export function MorePage() {
  const { user, signOut, deleteAccount, reauth } = useAuth()
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [password, setPassword] = useState('')
  const confirmRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const focusPasswordOnError = useRef(false)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const [deleteError, setDeleteError] = useState('')
  const [busy, setBusy] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const online = useOnline()
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await runSignOut()
    } finally {
      setSigningOut(false)
    }
  }

  async function runSignOut() {
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
    setPassword('')
    setDeleteError('')
  }, [busy])

  useEffect(() => {
    if (deleting) confirmRef.current?.focus()
  }, [deleting])

  useEffect(() => {
    if (!deleteError) return
    if (focusPasswordOnError.current) passwordRef.current?.focus()
    else errorRef.current?.focus()
    focusPasswordOnError.current = false
  }, [deleteError])

  async function handleDelete() {
    if (busy) return
    if (!navigator.onLine) {
      setDeleteError('Sem conexão: conecte-se à internet para excluir sua conta.')
      return
    }
    setDeleteError('')
    setBusy(true)
    try {
      const auth = await reauth(password)
      if (!auth.success) {
        if (auth.reason === 'wrong_password') {
          setPassword('')
          focusPasswordOnError.current = true
        }
        setDeleteError(REAUTH_ERRORS[auth.reason])
        return
      }
      const result = await deleteAccount()
      if (result.success) navigate('/auth', { replace: true, state: { notice: 'Conta excluída' } })
      else {
        if (result.reauthRequired) setPassword('')
        setDeleteError(result.errors[0])
      }
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
      <h2>Perfil</h2>
      {user && (
        <header className="profile-header">
          <span className="profile-header__avatar" aria-hidden="true">{initials(user.displayName)}</span>
          <div>
            <p className="profile-header__name">{user.displayName}</p>
            <p className="profile-header__email">{user.email}</p>
          </div>
        </header>
      )}
      <section aria-labelledby="settings-title">
        <h3 id="settings-title">Aparência</h3>
        <Button onClick={toggleTheme}>{theme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro'}</Button>
        <p>Tema atual: {theme === 'light' ? 'claro' : 'escuro'}.</p>
      </section>
      <section aria-labelledby="privacy-title">
        <h3 id="privacy-title">Privacidade</h3>
        <p><Link to="/privacidade">Política de Privacidade</Link> · <Link to="/termos">Termos de Uso</Link></p>
        <Button disabled={exporting} onClick={() => void handleExport()}>{exporting ? 'Exportando…' : 'Exportar meus dados'}</Button>
        {exported && <p role="status">Arquivo gerado. Confira seus downloads.</p>}
      </section>
      <section aria-labelledby="account-title">
        <h3 id="account-title">Conta</h3>
        {error && <p role="alert" className="organization-error">{error}</p>}
        <Button disabled={signingOut} onClick={() => void handleSignOut()}>{signingOut ? 'Saindo…' : 'Sair'}</Button>
        {signingOut && <p role="status" aria-live="polite">Saindo da conta…</p>}
      </section>
      <section aria-labelledby="danger-title" className="danger-zone">
        <h3 id="danger-title">Zona de perigo</h3>
        <Button variant="danger" onClick={() => setDeleting(true)}>Excluir minha conta</Button>
      </section>
      <ConfirmModal
        open={deleting}
        title="Excluir minha conta"
        message={`O que você criou para ${labels.organizationDefinite} continua lá, como “Ex-membro”. Seus dados pessoais, vínculos e escalas são apagados agora, inclusive alterações deste aparelho ainda não sincronizadas. Isso não pode ser desfeito.`}
        confirmLabel={busy ? 'Excluindo…' : 'Excluir definitivamente'}
        confirmDisabled={confirmText !== 'EXCLUIR' || !password || busy}
        cancelDisabled={busy}
        onConfirm={() => void handleDelete()}
        onCancel={closeDelete}
      >
        <div className="delete-account">
          <label>Digite EXCLUIR para confirmar <input ref={confirmRef} value={confirmText} onChange={(event) => setConfirmText(event.target.value)} autoComplete="off" /></label>
          <label>Senha <input ref={passwordRef} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" disabled={busy} /></label>
          <p role="status">{busy ? 'Confirmando…' : ''}</p>
          {!online && <p role="alert">Sem conexão: conecte-se à internet para excluir sua conta.</p>}
          {deleteError && online && <p role="alert" ref={errorRef} tabIndex={-1} className="delete-error">{deleteError}</p>}
        </div>
      </ConfirmModal>
    </main>
  )
}
