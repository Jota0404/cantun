import type { Organization } from '../../domain/organizations/organization'
import type { OrganizationMembership } from '../../domain/organizations/organizationMembership'
import { db as defaultDb, type SalmodiaDatabase } from '../database'

export class OrganizationRepository {
  constructor(private readonly db: SalmodiaDatabase = defaultDb) {}

  async create(value: Organization) { await this.db.organizations.add(value) }
  async getById(id: string) { return this.db.organizations.get(id) }
  async list() { return this.db.organizations.orderBy('updatedAt').reverse().toArray() }
  async update(value: Organization) { await this.db.organizations.put(value) }
  async remove(id: string) { await this.db.organizations.delete(id) }
}

export class OrganizationMembershipRepository {
  constructor(private readonly db: SalmodiaDatabase = defaultDb) {}

  async create(value: OrganizationMembership) { await this.db.organizationMemberships.add(value) }
  async getById(id: string) { return this.db.organizationMemberships.get(id) }
  async listByOrganizationId(organizationId: string) { return this.db.organizationMemberships.where('organizationId').equals(organizationId).toArray() }
  async findByOrganizationAndUser(organizationId: string, userId: string) { return this.db.organizationMemberships.where('[organizationId+userId]').equals([organizationId, userId]).first() }
  async update(value: OrganizationMembership) { await this.db.organizationMemberships.put(value) }
  async remove(id: string) { await this.db.organizationMemberships.delete(id) }
}

export const organizationRepository = new OrganizationRepository()
export const organizationMembershipRepository = new OrganizationMembershipRepository()
