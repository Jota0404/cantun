import { teamMembershipRepository, type TeamMembershipRepository } from '../../db/repositories/teamRepository'
import type { MemberDisplayStatus, MemberStatus, TeamMembership, TeamRole } from '../../domain/teams/teamMembership'
import { normalizeDisplayName } from '../../domain/users/displayName'
import { rpc } from '../../platform/rpc'
import { selectRows } from '../../platform/sync'
import { getCurrentUser } from '../../platform/auth'
import { teamRepository } from '../../db/repositories/teamRepository'
import { organizationMembershipRepository } from '../../db/repositories/organizationRepository'
import type { AccessContext } from '../../domain/access/permissions'
import { listOrganizationInvites } from '../organizations/organizationInviteService'

// Papel, status e funções só mudam por RPC (o banco autoriza, RN-12). Sem fila offline:
// a mudança local só é aplicada depois que o servidor aceita.

export type TeamMemberResult = { success: true; membership: TeamMembership } | { success: false; errors: string[] }

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

async function changeMembership(
  membershipId: string,
  rpcName: string,
  params: Record<string, unknown>,
  patch: Partial<Pick<TeamMembership, 'role' | 'status'>>,
  repository: TeamMembershipRepository,
): Promise<TeamMemberResult> {
  const local = await repository.getById(membershipId)
  if (!local) return { success: false, errors: ['Membro não encontrado.'] }
  try {
    const data = await rpc(rpcName, { p_team_membership_id: membershipId, ...params })
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
    const updatedAt = typeof row?.updated_at === 'string' ? row.updated_at : new Date().toISOString()
    const membership: TeamMembership = { ...local, ...patch, updatedAt }
    await repository.putLocal(membership)
    return { success: true, membership }
  } catch (error) {
    return { success: false, errors: [errorMessage(error, 'Não foi possível atualizar o membro.')] }
  }
}

function setRole(membershipId: string, role: TeamRole, repository: TeamMembershipRepository) {
  return changeMembership(membershipId, 'set_team_member_role', { p_role: role }, { role }, repository)
}

export function promoteToLeader(membershipId: string, repository = teamMembershipRepository): Promise<TeamMemberResult> {
  return setRole(membershipId, 'leader', repository)
}

export function demoteToMember(membershipId: string, repository = teamMembershipRepository): Promise<TeamMemberResult> {
  return setRole(membershipId, 'member', repository)
}

export async function setMemberStatus(
  input: { membershipId: string; status: MemberStatus },
  repository = teamMembershipRepository,
): Promise<TeamMemberResult> {
  if (input.status !== 'active' && input.status !== 'inactive') return { success: false, errors: ['Status inválido.'] }
  return changeMembership(input.membershipId, 'set_team_member_status', { p_status: input.status }, { status: input.status }, repository)
}

export async function setMemberFunctions(input: {
  membershipId: string
  musicalFunctions: string[]
}): Promise<{ success: true; musicalFunctions: string[] } | { success: false; errors: string[] }> {
  const musicalFunctions = [...new Set(input.musicalFunctions.map((value) => value.trim()).filter(Boolean))]
  try {
    const data = await rpc('set_team_member_functions', { p_team_membership_id: input.membershipId, p_musical_functions: musicalFunctions })
    const saved = Array.isArray(data)
      ? data.flatMap((row) => row && typeof row === 'object' && 'musical_function' in row ? [String(row.musical_function)] : [])
      : musicalFunctions
    return { success: true, musicalFunctions: saved }
  } catch (error) {
    return { success: false, errors: [errorMessage(error, 'Não foi possível salvar as funções.')] }
  }
}

/** Depois do sucesso, a UI chama `useAuth().refresh()` para atualizar o nome da sessão. */
export async function setMyDisplayName(displayName: string): Promise<{ success: true; displayName: string } | { success: false; errors: string[] }> {
  const normalized = normalizeDisplayName(displayName)
  if (!normalized) return { success: false, errors: ['Informe um nome de 1 a 80 caracteres.'] }
  try {
    await rpc('set_my_display_name', { p_display_name: normalized })
    return { success: true, displayName: normalized }
  } catch (error) {
    return { success: false, errors: [errorMessage(error, 'Não foi possível salvar o nome.')] }
  }
}

export interface TeamMemberView {
  /** Vínculo; ausente em convite pendente. */
  membershipId?: string
  /** Convite pendente; ausente em vínculo. */
  inviteId?: string
  userId?: string
  displayName: string
  role: TeamRole
  displayStatus: MemberDisplayStatus
  /** Funções na equipe; `[]` sem rede (não há store local) e em convite pendente. */
  musicalFunctions: string[]
}

// Último valor conhecido: offline, a tela mostra os nomes já lidos (VS-01 §Dados).
const profileCache = new Map<string, string>()

async function loadProfiles(organizationId: string) {
  try {
    const rows = await rpc<Array<{ user_id: string; display_name: string }> | null>('get_organization_member_profiles', { p_organization_id: organizationId })
    for (const row of rows ?? []) profileCache.set(row.user_id, row.display_name)
  } catch {
    // Offline ou sem permissão: segue com o cache.
  }
}

// A RLS de `team_musical_functions` devolve só o que o usuário pode ler; filtra pelos vínculos da equipe.
async function loadFunctions(membershipIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>()
  if (!membershipIds.length) return result
  const wanted = new Set(membershipIds)
  const rows = await selectRows<{ team_membership_id: string; musical_function: string }>('team_musical_functions').catch(() => [])
  for (const row of rows) {
    if (!wanted.has(row.team_membership_id)) continue
    result.set(row.team_membership_id, [...(result.get(row.team_membership_id) ?? []), row.musical_function])
  }
  return result
}

/** Contexto de quem está logado para `hasPermission` (só UX; o banco decide). Offline, lê do Dexie. */
export async function getMyAccessContext(input: { organizationId: string; teamId?: string }): Promise<AccessContext> {
  const user = getCurrentUser()
  if (!user) return { organizationRole: null }
  const organizationMembership = await organizationMembershipRepository.findByOrganizationAndUser(input.organizationId, user.id)
  const teams = await teamRepository.listByOrganizationId(input.organizationId)
  const mine = (await Promise.all(teams.map((team) => teamMembershipRepository.findByTeamAndUser(team.id, user.id))))
    .filter((membership): membership is TeamMembership => Boolean(membership))
  const current = input.teamId ? mine.find((membership) => membership.teamId === input.teamId) : undefined
  return {
    organizationRole: organizationMembership?.role ?? null,
    teamRole: current?.role ?? null,
    teamStatus: current?.status ?? null,
    isActiveLeaderInOrganization: mine.some((membership) => membership.role === 'leader' && membership.status === 'active'),
    isActiveInOrganization: mine.length === 0 || mine.some((membership) => membership.status === 'active'),
  }
}

/** Membros da equipe com nome de exibição (nunca e-mail, RN-15) e convites pendentes como `pending_invite`. */
export async function listTeamMembers(
  input: { organizationId: string; teamId: string; includePendingInvites?: boolean },
  repository = teamMembershipRepository,
): Promise<TeamMemberView[]> {
  const [memberships, invites] = await Promise.all([
    repository.listByTeamId(input.teamId),
    input.includePendingInvites ? listOrganizationInvites(input.organizationId).catch(() => []) : Promise.resolve([]),
    loadProfiles(input.organizationId),
  ])
  const functionsByMembership = await loadFunctions(memberships.map((membership) => membership.id))
  const members: TeamMemberView[] = memberships.map((membership) => ({
    membershipId: membership.id,
    userId: membership.userId,
    displayName: profileCache.get(membership.userId) ?? 'Participante',
    role: membership.role,
    displayStatus: membership.status,
    musicalFunctions: functionsByMembership.get(membership.id) ?? [],
  }))
  const pending: TeamMemberView[] = invites
    .filter((invite) => invite.teamId === input.teamId && invite.status === 'pending')
    .map((invite) => ({ inviteId: invite.id, displayName: 'Convite pendente', role: 'member', displayStatus: 'pending_invite', musicalFunctions: [] }))
  return [...members, ...pending]
}
