import type { Team } from '../../domain/teams/team'
import type { TeamMembership } from '../../domain/teams/teamMembership'
import { db as defaultDb, type SalmodiaDatabase } from '../database'
import { queueTargetDelete, queueTargetUpsert } from '../../sync/syncService'

export class TeamRepository {
  private readonly db: SalmodiaDatabase
  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }
  async create(value: Team) { await this.db.teams.add(value); await queueTargetUpsert('teams', value) }
  async getById(id: string) { return this.db.teams.get(id) }
  async listByOrganizationId(organizationId: string) { return this.db.teams.where('organizationId').equals(organizationId).toArray() }
  async update(value: Team) { await this.db.teams.put(value); await queueTargetUpsert('teams', value) }
  async remove(id: string) { await this.db.teams.delete(id); await queueTargetDelete('teams', id) }
}

export class TeamMembershipRepository {
  constructor(private readonly db: SalmodiaDatabase = defaultDb) {}
  async create(value: TeamMembership) { await this.db.teamMemberships.add(value); await queueTargetUpsert('teamMemberships', value) }
  async getById(id: string) { return this.db.teamMemberships.get(id) }
  async listByTeamId(teamId: string) { return this.db.teamMemberships.where('teamId').equals(teamId).toArray() }
  async findByTeamAndUser(teamId: string, userId: string) { return this.db.teamMemberships.where('[teamId+userId]').equals([teamId, userId]).first() }
  async update(value: TeamMembership) { await this.db.teamMemberships.put(value); await queueTargetUpsert('teamMemberships', value) }
  async remove(id: string) { await this.db.teamMemberships.delete(id); await queueTargetDelete('teamMemberships', id) }
}

export const teamRepository = new TeamRepository()
export const teamMembershipRepository = new TeamMembershipRepository()
