import type { Team } from '../../domain/teams/team'
import type { TeamMembership } from '../../domain/teams/teamMembership'
import { teamRepository, teamMembershipRepository } from '../../db/repositories/teamRepository'
import { supabase } from '../../lib/supabase'

export async function createTeam(organizationId: string, name: string, id = crypto.randomUUID()): Promise<Team> {
  const now = new Date().toISOString()
  const team: Team = { id, organizationId, name: name.trim(), createdAt: now, updatedAt: now }
  await teamRepository.create(team)
  const user = (await supabase?.auth.getUser())?.data.user
  if (user) await addTeamMember(team.id, user.id)
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
  const membership: TeamMembership = { id, teamId, userId, createdAt: now, updatedAt: now }
  await teamMembershipRepository.create(membership)
  return membership
}
