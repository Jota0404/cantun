import type { MemberAvailability } from '../../domain/services/memberAvailability'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'
import { queueTargetDelete, queueTargetUpsert } from '../../sync/syncService'

export class MemberAvailabilityRepository {
  private readonly db: SalmodiaDatabase
  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }
  async put(value: MemberAvailability): Promise<void> { await this.db.memberAvailability.put(value); await queueTargetUpsert('memberAvailability', value) }
  async remove(id: string): Promise<void> { await this.db.memberAvailability.delete(id); await queueTargetDelete('memberAvailability', id) }
  async findByUserAndDate(userId: string, organizationId: string, date: string): Promise<MemberAvailability | undefined> {
    return this.db.memberAvailability.where('[organizationId+date]').equals([organizationId, date]).filter((item) => item.userId === userId).first()
  }
  async listByOrganizationAndDate(organizationId: string, date: string): Promise<MemberAvailability[]> {
    return this.db.memberAvailability.where('[organizationId+date]').equals([organizationId, date]).toArray()
  }
  async listByUser(userId: string, organizationId: string): Promise<MemberAvailability[]> {
    return this.db.memberAvailability.where('userId').equals(userId).filter((item) => item.organizationId === organizationId).sortBy('date')
  }
}
export const memberAvailabilityRepository = new MemberAvailabilityRepository()
