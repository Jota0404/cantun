import { randomUUID } from 'crypto'
import type { Team } from '../../domain/teams/team'
import type { TeamMembership } from '../../domain/teams/teamMembership'
import { teamRepository, teamMembershipRepository } from '../../db/repositories/teamRepository'

export async function createTeam(organizationId: string, name: string, id = randomUUID()): Promise<Team> {
  const now = new Date().toISOString()
  const team: Team = { id, organizationId, name: name.trim(), createdAt: now, updatedAt: now }
  await teamRepository.create(team)
  return team
}

export async function addTeamMember(teamId: string, userId: string, id = randomUUID()): Promise<TeamMembership> {
  const now = new Date().toISOString()
  const membership: TeamMembership = { id, teamId, userId, createdAt: now, updatedAt: now }
  await teamMembershipRepository.create(membership)
  return membership
}
