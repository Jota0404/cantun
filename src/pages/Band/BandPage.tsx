import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import { getBandInvite, acceptBandInvite, buildBandInviteUrl } from '../../application/bands/bandInviteService'
import { getLegacyBandOrganizationContext } from '../../application/organizations/legacyBandBridgeService'
import { syncBands } from '../../sync/bandSyncService'
import './BandPage.css'

export function BandListPage() {
  const navigate = useNavigate()
  useEffect(() => { navigate('/organizations', { replace: true }) }, [navigate])
  return <main className="band-page"><section className="band-card"><p>Redirecionando para Organizações…</p></section></main>
}

export function BandDetailPage() {
  const { bandId = '' } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  useEffect(() => {
    if (!bandId) { navigate('/organizations', { replace: true }); return }
    void getLegacyBandOrganizationContext(bandId)
      .then((context) => {
        if (!context) throw new Error('Esta banda legada não está disponível para sua conta.')
        navigate(`/organizations/${context.organizationId}/teams/${context.teamId}`, { replace: true })
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível abrir a equipe.'))
  }, [bandId, navigate])
  return <main className="band-page"><section className="band-card"><Link to="/organizations">← Organizações</Link><p>{error || 'Abrindo equipe…'}</p></section></main>
}

export function BandInvitePage() {
  const { token = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [invite, setInvite] = useState<Awaited<ReturnType<typeof getBandInvite>>>(null)
  const [error, setError] = useState(token ? '' : 'Convite inválido.')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!token) return
    void getBandInvite(token).then(setInvite).catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível validar o convite.'))
  }, [token])
  async function accept() {
    setBusy(true); setError('')
    try {
      const result = await acceptBandInvite(token)
      await syncBands()
      navigate(`/organizations/${result.organizationId}/teams/${result.teamId}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível aceitar o convite.')
    } finally { setBusy(false) }
  }
  if (!user) return <main className="band-page"><section className="band-card"><h2>Convite para equipe</h2><p>Faça login para visualizar e aceitar este convite.</p><Link to={`/auth?redirect=${encodeURIComponent(`/bands/invite/${token}`)}`}>Entrar</Link></section></main>
  return <main className="band-page"><section className="band-card invite-page"><span>CONVITE</span><h2>{invite?.bandName ?? 'Validando…'}</h2>{invite && <p>Você receberá o papel de <strong>{invite.role}</strong>.</p>}{invite?.inviteeEmail && <p>Destinado a <strong>{invite.inviteeEmail}</strong>.</p>}{invite && invite.status !== 'pending' && <p role="alert">Este convite está {invite.status}.</p>}{error && <p className="band-error" role="alert">{error}</p>}{invite?.status === 'pending' && <div className="invite-actions"><button type="button" disabled={busy} onClick={() => void accept()}>{busy ? 'Aceitando…' : 'Aceitar convite'}</button><button type="button" onClick={() => navigate('/')}>Cancelar</button></div>}</section></main>
}

export { buildBandInviteUrl }
