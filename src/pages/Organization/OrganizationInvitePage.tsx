import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import { acceptOrganizationInvite, getOrganizationInvite, type OrganizationInvitePreview } from '../../application/organizations/organizationInviteService'
import { syncTargetDomain } from '../../sync/syncService'
import './OrganizationPage.css'

export function OrganizationInvitePage() {
  const { token = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [invite, setInvite] = useState<OrganizationInvitePreview | null>(null)
  const [error, setError] = useState(token ? '' : 'Convite inválido.')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token) return
    void getOrganizationInvite(token)
      .then(setInvite)
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível validar o convite.'))
  }, [token])

  async function accept() {
    setBusy(true)
    setError('')
    try {
      const result = await acceptOrganizationInvite(token)
      await syncTargetDomain()
      navigate(`/organizations/${result.organizationId}/teams/${result.teamId}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível aceitar o convite.')
    } finally {
      setBusy(false)
    }
  }

  if (!user) return (
    <main className="organization-page">
      <section className="organization-card">
        <h2>Convite para equipe</h2>
        <p>Faça login para visualizar e aceitar este convite.</p>
        <Link to={`/auth?redirect=${encodeURIComponent(`/organization/invite/${token}`)}`}>Entrar</Link>
      </section>
    </main>
  )

  return (
    <main className="organization-page">
      <section className="organization-card">
        <span>CONVITE</span>
        <h2>{invite?.teamName ?? 'Validando…'}</h2>
        {invite && <p>Organização: <strong>{invite.organizationName}</strong></p>}
        {invite && <p>Você receberá o acesso <strong>{invite.role}</strong>.</p>}
        {invite?.inviteeEmail && <p>Destinado a <strong>{invite.inviteeEmail}</strong>.</p>}
        {invite && invite.status !== 'pending' && <p role="alert">Este convite está {invite.status}.</p>}
        {error && <p role="alert" className="organization-error">{error}</p>}
        {invite?.status === 'pending' && (
          <div>
            <button type="button" disabled={busy} onClick={() => void accept()}>{busy ? 'Aceitando…' : 'Aceitar convite'}</button>
            <button type="button" onClick={() => navigate('/')}>Cancelar</button>
          </div>
        )}
      </section>
    </main>
  )
}
