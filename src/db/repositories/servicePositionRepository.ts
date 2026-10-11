import type { ServicePosition } from '../../domain/services/servicePosition'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'
import { queueTargetDelete, queueTargetUpsert } from '../../sync/syncService'

export class ServicePositionRepository {
  private readonly db: SalmodiaDatabase
  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }
  async create(value: ServicePosition): Promise<void> { await this.db.servicePositions.add(value); await queueTargetUpsert('servicePositions', value) }
  async getById(id: string): Promise<ServicePosition | undefined> { return this.db.servicePositions.get(id) }
  async listByServiceId(serviceId: string): Promise<ServicePosition[]> { return this.db.servicePositions.where('serviceId').equals(serviceId).sortBy('createdAt') }
  async update(value: ServicePosition): Promise<void> { await this.db.servicePositions.put(value); await queueTargetUpsert('servicePositions', value) }
  async remove(id: string): Promise<void> { await this.db.servicePositions.delete(id); await queueTargetDelete('servicePositions', id) }
}
export const servicePositionRepository = new ServicePositionRepository()
