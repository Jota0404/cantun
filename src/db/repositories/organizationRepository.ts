import type { Organization } from '../../domain/organizations/organization'
import { db as defaultDb, type SalmodiaDatabase } from '../database'
import { queueTargetDelete, queueTargetUpsert } from '../../sync/syncService'

export class OrganizationRepository {
  private readonly db: SalmodiaDatabase
  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }
  async create(value: Organization) { await this.db.organizations.add(value); await queueTargetUpsert('organizations', value) }
  async getById(id: string) { return this.db.organizations.get(id) }
  async list() { return this.db.organizations.orderBy('updatedAt').reverse().toArray() }
  async update(value: Organization) { await this.db.organizations.put(value); await queueTargetUpsert('organizations', value) }
  async remove(id: string) { await this.db.organizations.delete(id); await queueTargetDelete('organizations', id) }
}

/** Só leitura: o vínculo muda por RPC no servidor (issue #99), nunca por escrita direta. */
export class OrganizationMembershipRepository {
  private readonly db: SalmodiaDatabase
  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }
  async getById(id: string) { return this.db.organizationMemberships.get(id) }
  async listByOrganizationId(organizationId: string) { return this.db.organizationMemberships.where('organizationId').equals(organizationId).toArray() }
  async findByOrganizationAndUser(organizationId: string, userId: string) { return this.db.organizationMemberships.where('[organizationId+userId]').equals([organizationId, userId]).first() }
}

export const organizationRepository = new OrganizationRepository()
export const organizationMembershipRepository = new OrganizationMembershipRepository()
