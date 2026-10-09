import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { onRemoteDataApplied } from '../../application/sync/remoteData'
import { useAuth } from '../../auth/authContext'
import { updateTeam, getTeam } from '../../application/teams/teamService'
import {
  demoteToMember, getMyAccessContext, listTeamMembers, promoteToLeader, setMemberFunctions, setMemberStatus, setMyDisplayName,
  type TeamMemberView,
} from '../../application/teams/teamMemberService'
import { createOrganizationInvite, buildOrganizationInviteUrl, revokeOrganizationInvite, type OrganizationInviteRole } from '../../application/organizations/organizationInviteService'
import { hasPermission, type AccessContext } from '../../domain/access/permissions'
import { canChangeRole, canChangeStatus, canSetFunctions } from '../../domain/teams/memberRules'
import type { Team } from '../../domain/teams/team'
import type { MemberDisplayStatus } from '../../domain/teams/teamMembership'
import { MUSICAL_FUNCTIONS, musicalFunctionLabel } from '../../components/team/musicalFunctions'
import './OrganizationPage.css'
import './TeamPage.css'

const STATUS_LABEL: Record<MemberDisplayStatus, string> = { active: 'Ativo', inactive: 'Inativo', pending_invite: 'Convite pendente' }
type StatusFilter = 'all' | MemberDisplayStatus

type Result = { success: true } | { success: false; errors: string[] }

export function TeamPage() {
  const { organizationId = '', teamId = '' } = useParams()
  const { user, refresh } = useAuth()
  const [team, setTeam] = useState<Team>()
  const [members, setMembers] = useState<TeamMemberView[]>([])
  const [access, setAccess] = useState<AccessContext>({ organizationRole: null })
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [functionFilter, setFunctionFilter] = useState('')
  const [editingFunctions, setEditingFunctions] = useState<string>()
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [inviteRole, setInviteRole] = useState<OrganizationInviteRole>('member')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const currentTeam = await getTeam(teamId)
      if (!currentTeam || currentTeam.organizationId !== organizationId) { setError('Equipe não encontrada.'); return }
      const [context, teamMembers] = await Promise.all([
        getMyAccessContext({ organizationId, teamId }),
        listTeamMembers({ organizationId, teamId, includePendingInvites: true }),
      ])
      setTeam(currentTeam)
      setAccess(context)
      setMembers(teamMembers)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar a equipe.')
    } finally {
      setLoading(false)
    }
  }, [organizationId, teamId])

  useEffect(() => {
    void load()
    return onRemoteDataApplied(() => { void load() })
  }, [load])

  // Mudanças só online: em erro, mostra a mensagem e mantém a tela.
  async function run(action: () => Promise<Result>, success?: string) {
    setError(''); setNotice('')
    try {
      const result = await action()
      if (!result.success) { setError(result.errors.join(' ')); return false }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a operação.')
      return false
    }
    if (success) setNotice(success)
    await load()
    return true
  }

  const ok = async (task: () => Promise<unknown>): Promise<Result> => { await task(); return { success: true } }
  const isAdmin = access.organizationRole === 'owner' || access.organizationRole === 'admin'
  const canInvite = hasPermission(access, 'team_member.add')

  async function renameTeam() {
    if (!team) return
    const name = window.prompt('Nome da equipe', team.name)?.trim()
    if (name) await run(() => ok(() => updateTeam(team, { name })))
  }

  async function saveDisplayName(event: FormEvent) {
    event.preventDefault()
    await run(async () => {
      const result = await setMyDisplayName(displayName)
      if (result.success) await refresh()
      return result
    }, 'Nome atualizado.')
  }

  async function toggleFunction(member: TeamMemberView, value: string) {
    if (!member.userId) return
    const next = member.musicalFunctions.includes(value) ? member.musicalFunctions.filter((item) => item !== value) : [...member.musicalFunctions, value]
    await run(() => setMemberFunctions({ teamId, userId: member.userId ?? '', musicalFunctions: next }))
  }

  async function invite(event: FormEvent) {
    event.preventDefault()
    await run(() => ok(async () => {
      const created = await createOrganizationInvite(organizationId, teamId, inviteRole, inviteEmail)
      setInviteUrl(buildOrganizationInviteUrl(created.token))
      setInviteEmail('')
      setCopied(false)
    }))
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
  }

  if (loading) return <main className="organization-page"><p>Carregando equipe…</p></main>
  if (!team) return <main className="organization-page"><p role="alert">{error || 'Equipe não encontrada.'}</p></main>

  const activeMembers = members.filter((member) => member.displayStatus === 'active')
  const uncovered = MUSICAL_FUNCTIONS.filter(({ value }) => !activeMembers.some((member) => member.musicalFunctions.includes(value)))
  const hasActiveLeader = activeMembers.some((member) => member.role === 'leader')
  const visible = members.filter((member) =>
    (statusFilter === 'all' || member.displayStatus === statusFilter) &&
    (!functionFilter || member.musicalFunctions.includes(functionFilter)))

  return (
    <main className="organization-page">
      <section className="organization-card">
        <header>
          <Link to={`/organizations/${organizationId}`}>← Organização</Link>
          <span>EQUIPE</span>
          <h2>{team.name}</h2>
          <p>{activeMembers.length} membro(s) ativo(s)</p>
          {hasPermission(access, 'team.rename') && <button type="button" onClick={() => void renameTeam()}>Renomear equipe</button>}
        </header>
        {error && <p role="alert" className="organization-error">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {!hasActiveLeader && <p className="team-warning" role="note">Esta equipe está sem Líder ativo. Owner ou Admin podem promover alguém.</p>}

        <section aria-labelledby="uncovered-title" className="team-uncovered">
          <h3 id="uncovered-title">Funções sem ninguém</h3>
          {uncovered.length === 0
            ? <p>Todas as funções têm ao menos uma pessoa ativa.</p>
            : <ul>{uncovered.map((item) => <li key={item.value}>{item.label}</li>)}</ul>}
        </section>

        <section aria-labelledby="members-title">
          <h3 id="members-title">Membros</h3>
          <div className="team-filters">
            <label>Status
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                <option value="all">Todos</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
                <option value="pending_invite">Convites pendentes</option>
              </select>
            </label>
            <label>Função
              <select value={functionFilter} onChange={(event) => setFunctionFilter(event.target.value)}>
                <option value="">Todas</option>
                {MUSICAL_FUNCTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          </div>
          {visible.length === 0 ? <p>Nenhum membro com esses filtros.</p> : (
            <ul className="team-members">
              {visible.map((member) => {
                const key = member.membershipId ?? member.inviteId ?? ''
                const isMe = member.userId === user?.id
                const name = isMe ? `${member.displayName} (você)` : member.displayName
                const target = member.userId && member.displayStatus !== 'pending_invite'
                  ? { role: member.role, status: member.displayStatus, userId: member.userId }
                  : undefined
                const membershipId = member.membershipId ?? ''
                return (
                  <li key={key} className="team-member">
                    <div>
                      <strong>{name}</strong>
                      <span>{member.role === 'leader' ? 'Líder' : 'Membro'} · {STATUS_LABEL[member.displayStatus]}</span>
                      <span>Funções: {member.musicalFunctions.length ? member.musicalFunctions.map(musicalFunctionLabel).join(', ') : 'nenhuma'}</span>
                    </div>
                    <div className="team-member__actions">
                      {target && canChangeRole(access, target, 'leader') && <button type="button" onClick={() => void run(() => promoteToLeader(membershipId))}>Promover a Líder de {member.displayName}</button>}
                      {target && canChangeRole(access, target, 'member') && <button type="button" onClick={() => void run(() => demoteToMember(membershipId))}>Rebaixar a Membro {member.displayName}</button>}
                      {target && canChangeStatus(access, target, 'inactive') && <button type="button" onClick={() => void run(() => setMemberStatus({ membershipId, status: 'inactive' }))}>Inativar {member.displayName}</button>}
                      {target && canChangeStatus(access, target, 'active') && <button type="button" onClick={() => void run(() => setMemberStatus({ membershipId, status: 'active' }))}>Reativar {member.displayName}</button>}
                      {target && canSetFunctions(access, target, user?.id ?? '') && (
                        <button type="button" aria-expanded={editingFunctions === key} onClick={() => setEditingFunctions(editingFunctions === key ? undefined : key)}>Editar funções de {member.displayName}</button>
                      )}
                      {member.inviteId && canInvite && <button type="button" onClick={() => void run(() => ok(() => revokeOrganizationInvite(member.inviteId ?? '')))}>Revogar convite</button>}
                    </div>
                    {editingFunctions === key && (
                      <fieldset className="team-functions">
                        <legend>Funções de {member.displayName}</legend>
                        {MUSICAL_FUNCTIONS.map((item) => (
                          <label key={item.value}>
                            <input type="checkbox" checked={member.musicalFunctions.includes(item.value)} onChange={() => void toggleFunction(member, item.value)} />
                            {item.label}
                          </label>
                        ))}
                      </fieldset>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {canInvite && <section aria-labelledby="invite-title">
          <h3 id="invite-title">Convidar para esta equipe</h3>
          <form className="team-invite" onSubmit={(event) => void invite(event)}>
            {isAdmin && <label>Acesso
              <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as OrganizationInviteRole)}>
                <option value="member">Membro</option>
                <option value="admin">Administrador</option>
              </select>
            </label>}
            <label>E-mail (opcional)<input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} type="email" /></label>
            <button type="submit">Gerar convite</button>
          </form>
          {inviteUrl && <div><input readOnly value={inviteUrl} aria-label="Link do convite" /><button type="button" onClick={() => void copyInvite()}>{copied ? 'Copiado' : 'Copiar link'}</button></div>}
        </section>}

        <section aria-labelledby="my-name-title">
          <h3 id="my-name-title">Seu nome na equipe</h3>
          <form className="team-invite" onSubmit={(event) => void saveDisplayName(event)}>
            <label>Nome de exibição<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={80} autoComplete="name" /></label>
            <button type="submit">Salvar nome</button>
          </form>
        </section>
      </section>
    </main>
  )
}
