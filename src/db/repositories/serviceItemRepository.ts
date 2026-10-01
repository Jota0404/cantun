import type { ServiceItem } from '../../domain/services/serviceItem'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'
import { queueTargetDelete, queueTargetUpsert } from '../../sync/syncService'

export class ServiceItemRepository {
  private readonly db: SalmodiaDatabase
  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }
  async create(value: ServiceItem): Promise<void> { await this.db.serviceItems.add(value); await queueTargetUpsert('serviceItems', value) }
  async getById(id: string): Promise<ServiceItem | undefined> { return this.db.serviceItems.get(id) }
  async listByServiceId(serviceId: string): Promise<ServiceItem[]> { return this.db.serviceItems.where('serviceId').equals(serviceId).sortBy('position') }
  async update(value: ServiceItem): Promise<void> { await this.db.serviceItems.put(value); await queueTargetUpsert('serviceItems', value) }
  async remove(id: string): Promise<void> { await this.db.serviceItems.delete(id); await queueTargetDelete('serviceItems', id) }
}
export const serviceItemRepository = new ServiceItemRepository()
