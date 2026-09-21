import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import { organizationMembershipRepository } from '../../db/repositories/organizationRepository'
import { teamMembershipRepository, teamRepository } from '../../db/repositories/teamRepository'
import { getMyTeamMusicalFunctions, setMyTeamMusicalFunctions } from '../../application/teams/musicalFunctionService'
import { createOrganizationInvite, buildOrganizationInviteUrl, listOrganizationInvites, revokeOrganizationInvite, updateOrganizationMemberRole, removeOrganizationMember, type OrganizationInvite, type OrganizationInviteRole } from '../../application/organizations/organizationInviteService'
import type { Team } from '../../domain/teams/team'
import type { TeamMembership } from '../../domain/teams/teamMembership'
import type { OrganizationMembership } from '../../domain/organizations/organizationMembership'
import type { OrganizationInviteStatus } from '../../application/organizations/organizationInviteService'
import './OrganizationPage.css'

const FUNCTION_OPTIONS = ['vocals', 'guitar', 'bass', 'drums', 'keys', 'acoustic_guitar', 'electric_guitar', 'other']

export function TeamPage() {
  const { organizationId = '', teamId = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [team, setTeam] = useState<Team>()
  const [members, setMembers] = useState<TeamMembership[]>([])
  const [organizationMembers, setOrganizationMembers] = useState<OrganizationMembership[]>([])
  const [invites, setInvites] = useState<Array<OrganizationInvite & { status: OrganizationInviteStatus }>>([])
  const [myFunctions, setMyFunctions] = useState<string[]>([])
  const [inviteRole, setInviteRole] = useState<OrganizationInviteRole>('member')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const currentTeam = await teamRepository.getById(teamId)
      if (!currentTeam || currentTeam.organizationId !== organizationId) { setError('Equipe não encontrada.'); return }
      const [teamMembers, orgMembers, musicalFunctions, organizationInvites] = await Promise.all([
        teamMembershipRepository.listByTeamId(teamId),
        organizationMembershipRepository.listByOrganizationId(organizationId),
        getMyTeamMusicalFunctions(teamId),
        listOrganizationInvites(organizationId),
      ])
      setTeam(currentTeam)
      setMembers(teamMembers)
      setOrganizationMembers(orgMembers)
      setMyFunctions(musicalFunctions)
      setInvites(organizationInvites.filter((invite) => invite.teamId === teamId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar a equipe.')
    } finally {
      setLoading(false)
    }
  }, [organizationId, teamId])

  useEffect(() => { void load() }, [load])

  const currentOrganizationMember = organizationMembers.find((member) => member.userId === user?.id)
  const canManage = currentOrganizationMember?.role === 'owner' || currentOrganizationMember?.role === 'admin'

  async function toggleFunction(value: string) {
    const next = myFunctions.includes(value) ? myFunctions.filter((item) => item !== value) : [...myFunctions, value]
    try { setMyFunctions(await setMyTeamMusicalFunctions(teamId, next)) }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar suas funções musicais.') }
  }

  async function renameTeam() {
    if (!team || !canManage) return
    const name = window.prompt('Nome da equipe', team.name)
    if (!name?.trim()) return
    try {
      await teamRepository.update({ ...team, name: name.trim(), updatedAt: new Date().toISOString() })
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível renomear a equipe.') }
  }

  async function invite() {
    if (!canManage) return
    try {
      const created = await createOrganizationInvite(organizationId, teamId, inviteRole, inviteEmail)
      setInviteUrl(buildOrganizationInviteUrl(created.token))
      setInviteEmail('')
      setCopied(false)
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível criar o convite.') }
  }

  async function copyInvite() {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
  }

  async function revoke(id: string) {
    try { await revokeOrganizationInvite(id); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível revogar o convite.') }
  }

  async function changeRole(membershipId: string, role: 'admin' | 'member') {
    try { await updateOrganizationMemberRole(membershipId, role); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível alterar o acesso.') }
  }

  async function removeOrganizationMembership(membershipId: string) {
    if (!window.confirm('Remover este membro da organização?')) return
    try { await removeOrganizationMember(membershipId); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível remover o membro.') }
  }

  if (loading) return <main className="organization-page"><p>Carregando equipe…</p></main>
  if (!team) return <main className="organization-page"><p>{error || 'Equipe não encontrada.'}</p></main>

  return (
    <main className="organization-page">
      <section className="organization-card">
        <header>
          <Link to={`/organizations/${organizationId}`}>← Organização</Link>
          <span>EQUIPE</span>
          <h2>{team.name}</h2>
          <p>{members.length} membro(s)</p>
          {canManage && <button type="button" onClick={() => void renameTeam()}>Renomear equipe</button>}
        </header>
        {error && <p role="alert" className="organization-error">{error}</p>}

        <section>
          <h3>Suas funções musicais</h3>
          <p>Uma pessoa pode exercer várias funções na mesma equipe.</p>
          <div>
            {FUNCTION_OPTIONS.map((value) => (
              <label key={value} style={{ display: 'inline-flex', gap: '.35rem', marginRight: '.75rem', marginBottom: '.5rem' }}>
                <input type="checkbox" checked={myFunctions.includes(value)} onChange={() => void toggleFunction(value)} />
                {value}
              </label>
            ))}
          </div>
        </section>

        <section>
          <h3>Membros da equipe</h3>
          <ul>
            {members.map((member) => {
              const organizationMember = organizationMembers.find((item) => item.userId === member.userId)
              const isCurrent = member.userId === user?.id
              return (
                <li key={member.id}>
                  <span>{isCurrent ? 'Você' : member.userId}</span>
                  <strong>{organizationMember?.role ?? 'desconhecido'}</strong>
                  {canManage && organizationMember && !isCurrent && organizationMember.role !== 'owner' && (
                    <>
                      <select aria-label={`Acesso de ${member.userId}`} value={organizationMember.role} onChange={(event) => void changeRole(organizationMember.id, event.target.value as 'admin' | 'member')}>
                        <option value="member">Membro</option>
                        <option value="admin">Administrador</option>
                      </select>
                      <button type="button" onClick={() => void removeOrganizationMembership(organizationMember.id)}>Remover da organização</button>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        </section>

        {canManage && <section>
          <h3>Convidar para esta equipe</h3>
          <div>
            <select aria-label="Acesso do convite" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as OrganizationInviteRole)}>
              <option value="member">Membro</option>
              <option value="admin">Administrador</option>
            </select>
            <input aria-label="Email do convite" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="Email (opcional)" type="email" />
            <button type="button" onClick={() => void invite()}>Gerar convite</button>
          </div>
          {inviteUrl && <div><input readOnly value={inviteUrl} aria-label="Link do convite" /><button type="button" onClick={() => void copyInvite()}>{copied ? 'Copiado' : 'Copiar'}</button></div>}
          <h4>Convites desta equipe</h4>
          <ul>
            {invites.map((invite) => <li key={invite.id}><span>{invite.inviteeEmail ?? 'Link compartilhável'} · {invite.role}</span><strong>{invite.status}</strong>{invite.status === 'pending' && <button type="button" onClick={() => void revoke(invite.id)}>Revogar</button>}</li>)}
          </ul>
        </section>}

        <p><button type="button" onClick={() => navigate(`/organizations/${organizationId}`)}>Voltar para organização</button></p>
      </section>
    </main>
  )
}
