import { useEffect } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
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
import { SyncStatusNotice } from './components/sync/SyncStatusNotice'
import { OrganizationPage } from './pages/Organization/OrganizationPage'
import { OrganizationDetailPage } from './pages/Organization/OrganizationDetailPage'
import { TeamPage } from './pages/Organization/TeamPage'
import { OrganizationInvitePage } from './pages/Organization/OrganizationInvitePage'
import { ServiceDetailPage } from './pages/Organization/ServiceDetailPage'
import { syncTargetDomain } from './sync/syncService'
import { AppNav } from './components/nav/AppNav'
import { ServicesPage } from './pages/Navigation/ServicesPage'
import { TeamsPage } from './pages/Navigation/TeamsPage'
import { MorePage } from './pages/Navigation/MorePage'
import { SkipLink } from './components/ui/SkipLink'
import './App.css'

function App() {
  const location = useLocation()
  const { user, loading } = useAuth()
  const isStageMode = location.pathname.startsWith('/stage/')
  // /auth/* abre sem sessão: os links de verificação e redefinição chegam por e-mail.
  const isAuthRoute = location.pathname === '/auth' || location.pathname.startsWith('/auth/')
  const isInviteRoute = location.pathname.startsWith('/organization/invite/')

  useEffect(() => {
    if (!user) return
    void syncTargetDomain()
    const handleOnline = () => { void syncTargetDomain() }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [user])

  if (loading) return <div className="shell"><main aria-live="polite"><p>Carregando sessão…</p></main></div>

  if (!user && !isAuthRoute) return <Navigate to="/auth" state={{ from: location.pathname + location.search }} replace />

  return (
    <div className={`shell${isStageMode ? ' shell--stage' : ''}`}>
      <SkipLink />
      {!isStageMode && !isAuthRoute && !isInviteRoute && <>
        <header className="app-header">
          <h1><Link to="/">CANTUM</Link></h1>
        </header>
        <AppNav />
        <EmailVerificationNotice />
        {user && <SyncStatusNotice />}
      </>}
      <div id="conteudo" tabIndex={-1} className="app-content">
      <Routes>
        <Route path="/" element={<HomePage />} /><Route path="/auth" element={<AuthPage />} />
        <Route path="/auth/verify-email" element={<VerifyEmailPage />} /><Route path="/auth/forgot-password" element={<ForgotPasswordPage />} /><Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route path="/songs" element={<SongLibraryPage />} /><Route path="/repertoires" element={<RepertoireListPage />} /><Route path="/repertoires/:repertoireId" element={<RepertoireDetailPage />} /><Route path="/organizations/:organizationId/repertoires/:repertoireId" element={<RepertoireDetailPage />} />
        <Route path="/stage/song/:songId" element={<StagePage />} /><Route path="/stage/service-session/:stageSessionId" element={<ServiceStagePage />} /><Route path="/stage/service-session/:stageSessionId/musician" element={<ServiceStageMusicianPage />} />
        <Route path="/songs/new" element={<NewSongPage />} /><Route path="/songs/import" element={<ImportSongPage />} /><Route path="/songs/:songId/edit" element={<EditSongPage />} /><Route path="/songs/:songId" element={<SongDetailPage />} />
        <Route path="/organizations" element={<OrganizationPage />} /><Route path="/organizations/:organizationId" element={<OrganizationDetailPage />} /><Route path="/servicos" element={<ServicesPage tab="mine" />} /><Route path="/meus-servicos" element={<ServicesPage tab="mine" />} /><Route path="/servicos/todos" element={<ServicesPage tab="all" />} /><Route path="/bandas" element={<TeamsPage />} /><Route path="/equipe" element={<Navigate to="/bandas" replace />} /><Route path="/mais" element={<MorePage />} /><Route path="/services/:serviceId" element={<ServiceDetailPage />} /><Route path="/organizations/:organizationId/teams/:teamId" element={<TeamPage />} /><Route path="/organization/invite/:token" element={<OrganizationInvitePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </div>
    </div>
  )
}

export default App
