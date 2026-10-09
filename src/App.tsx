import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './auth/authContext'
import { HomePage } from './pages/Home/HomePage'
import { NewSongPage } from './pages/Song/NewSongPage'
import { ImportSongPage } from './pages/Song/ImportSongPage'
import { SongDetailPage } from './pages/Song/SongDetailPage'
import { EditSongPage } from './pages/Song/EditSongPage'
import { SongLibraryPage } from './pages/Song/SongLibraryPage'
import { RepertoireListPage } from './pages/Repertoire/RepertoireListPage'
import { RepertoireDetailPage } from './pages/Repertoire/RepertoireDetailPage'
import { StagePage } from './pages/Stage/StagePage'
import { ServiceStagePage } from './pages/Stage/ServiceStagePage'
import { ServiceStageMusicianPage } from './pages/Stage/ServiceStageMusicianPage'
import { AuthPage } from './pages/Auth/AuthPage'
import { VerifyEmailPage } from './pages/Auth/VerifyEmailPage'
import { ForgotPasswordPage } from './pages/Auth/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/Auth/ResetPasswordPage'
import { EmailVerificationNotice } from './components/auth/EmailVerificationNotice'
import { OrganizationPage } from './pages/Organization/OrganizationPage'
import { OrganizationDetailPage } from './pages/Organization/OrganizationDetailPage'
import { TeamPage } from './pages/Organization/TeamPage'
import { OrganizationInvitePage } from './pages/Organization/OrganizationInvitePage'
import { ServiceDetailPage } from './pages/Organization/ServiceDetailPage'
import { syncTargetDomain } from './sync/syncService'
import { PendingLocalChangesError } from './auth/localSession'
import './App.css'

type Theme = 'light' | 'dark'

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const saved = window.localStorage.getItem('cantum-theme')
  return saved === 'dark' ? 'dark' : 'light'
}

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, loading, signOut } = useAuth()
  const isStageMode = location.pathname.startsWith('/stage/')
  // /auth/* abre sem sessão: os links de verificação e redefinição chegam por e-mail.
  const isAuthRoute = location.pathname === '/auth' || location.pathname.startsWith('/auth/')
  const isInviteRoute = location.pathname.startsWith('/organization/invite/')
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  async function handleSignOut() {
    try {
      await signOut()
    } catch (error) {
      if (!(error instanceof PendingLocalChangesError)) throw error
      const discard = window.confirm(
        `Há ${error.pendingCount} alteração(ões) feitas neste aparelho que ainda não foram sincronizadas. ` +
        'Se sair agora, elas serão descartadas. Conecte-se à internet para sincronizar antes de sair.\n\nSair mesmo assim?',
      )
      if (discard) await signOut({ discardPendingChanges: true })
    }
  }

  useEffect(() => {
    if (!user) return
    void syncTargetDomain()
    const handleOnline = () => { void syncTargetDomain() }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [user])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('cantum-theme', theme)
  }, [theme])

  if (loading) return <div className="shell"><main aria-live="polite"><p>Carregando sessão…</p></main></div>

  if (!user && !isAuthRoute) return <Navigate to="/auth" state={{ from: location.pathname + location.search }} replace />

  return (
    <div className={`shell${isStageMode ? ' shell--stage' : ''}`}>
      {!isStageMode && !isAuthRoute && !isInviteRoute && <>
        <header className="app-header">
          <div><p className="app-header__eyebrow">MUSIC WORKSPACE</p><h1><Link to="/">CANTUM</Link></h1></div>
          <div>{user ? <button type="button" onClick={() => void handleSignOut()}>Sair</button> : <button type="button" onClick={() => navigate('/auth')}>Entrar</button>}<button type="button" className="app-header__theme" onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} aria-label={`Ativar modo ${theme === 'light' ? 'escuro' : 'claro'}`}>{theme === 'light' ? 'Modo escuro' : 'Modo claro'}</button></div>
        </header>
        <nav aria-label="Navegação principal"><Link to="/songs">Biblioteca</Link><Link to="/songs/new">Nova música</Link><Link to="/songs/import">Importar música</Link><Link to="/repertoires">Repertórios</Link><Link to="/organizations">Organizações</Link></nav>
        <EmailVerificationNotice user={user} />
      </>}
      <Routes>
        <Route path="/" element={<HomePage />} /><Route path="/auth" element={<AuthPage />} />
        <Route path="/auth/verify-email" element={<VerifyEmailPage />} /><Route path="/auth/forgot-password" element={<ForgotPasswordPage />} /><Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route path="/songs" element={<SongLibraryPage />} /><Route path="/repertoires" element={<RepertoireListPage />} /><Route path="/repertoires/:repertoireId" element={<RepertoireDetailPage />} /><Route path="/organizations/:organizationId/repertoires/:repertoireId" element={<RepertoireDetailPage />} />
        <Route path="/stage/song/:songId" element={<StagePage />} /><Route path="/stage/service-session/:stageSessionId" element={<ServiceStagePage />} /><Route path="/stage/service-session/:stageSessionId/musician" element={<ServiceStageMusicianPage />} />
        <Route path="/songs/new" element={<NewSongPage />} /><Route path="/songs/import" element={<ImportSongPage />} /><Route path="/songs/:songId/edit" element={<EditSongPage />} /><Route path="/songs/:songId" element={<SongDetailPage />} />
        <Route path="/organizations" element={<OrganizationPage />} /><Route path="/organizations/:organizationId" element={<OrganizationDetailPage />} /><Route path="/services/:serviceId" element={<ServiceDetailPage />} /><Route path="/organizations/:organizationId/teams/:teamId" element={<TeamPage />} /><Route path="/organization/invite/:token" element={<OrganizationInvitePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default App
