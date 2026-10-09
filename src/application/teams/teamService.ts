import type { Team } from '../../domain/teams/team'
import type { TeamMembership } from '../../domain/teams/teamMembership'
import { teamRepository, teamMembershipRepository } from '../../db/repositories/teamRepository'
import { getCurrentUser } from '../../platform/auth'

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
