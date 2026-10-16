import type { Team } from '../../domain/teams/team'
import type { TeamMembership } from '../../domain/teams/teamMembership'
import { teamRepository, teamMembershipRepository } from '../../db/repositories/teamRepository'
import { getCurrentUser } from '../../platform/auth'
import { syncTargetDomain, targetSyncEngine } from '../../sync/syncService'

export async function createTeam(organizationId: string, name: string, id = crypto.randomUUID()): Promise<Team> {
  const now = new Date().toISOString()
  const team: Team = { id, organizationId, name: name.trim(), createdAt: now, updatedAt: now }
  await teamRepository.create(team)
  // Vínculo otimista `leader`, só local: o real é criado pelo servidor (trigger em `teams`, RN-03)
  // e substitui este no pull, pela chave [teamId+userId].
  const user = getCurrentUser()
  if (user) await teamMembershipRepository.putLocal({ id: crypto.randomUUID(), teamId: team.id, userId: user.id, role: 'leader', status: 'active', createdAt: now, updatedAt: now })
  return team
}

/** Equipes da organização, do Dexie (offline). */
export function listTeams(organizationId: string, repository = teamRepository): Promise<Team[]> {
  return repository.listByOrganizationId(organizationId)
}

/** Lê do Dexie: funciona offline. */
export function getTeam(teamId: string, repository = teamRepository): Promise<Team | undefined> {
  return repository.getById(teamId)
}

export async function updateTeam(team: Team, patch: Pick<Partial<Team>, 'name'>): Promise<Team> {
  const updated: Team = { ...team, ...patch, name: patch.name?.trim() || team.name, updatedAt: new Date().toISOString() }
  await teamRepository.update(updated)
  return updated
}

export async function removeTeam(teamId: string) {
  const members = await teamMembershipRepository.listByTeamId(teamId)
  for (const member of members) await teamMembershipRepository.remove(member.id)
  await teamRepository.remove(teamId)
}

export async function addTeamMember(teamId: string, userId: string, id = crypto.randomUUID()): Promise<TeamMembership> {
  const now = new Date().toISOString()
  const membership: TeamMembership = { id, teamId, userId, role: 'member', status: 'active', createdAt: now, updatedAt: now }
  await teamMembershipRepository.create(membership)
  return membership
}

const CONFIRM_ATTEMPTS = 3
const CONFIRM_WAIT_MS = 700

/** Espera o servidor aceitar a banda (e criar o vínculo de Líder, que chega no pull). Lança se não confirmar. */
export async function confirmTeamOnServer(teamId: string): Promise<void> {
  if (!targetSyncEngine) return
  for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
    await syncTargetDomain()
    if (await targetSyncEngine.isSent('teams', teamId)) return
    await new Promise((resolve) => setTimeout(resolve, CONFIRM_WAIT_MS))
  }
  throw new Error('Não foi possível confirmar com o servidor. Verifique a conexão e tente de novo.')
}
