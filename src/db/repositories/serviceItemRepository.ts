import type { ServiceItem } from '../../domain/services/serviceItem'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'

export class ServiceItemRepository {
  constructor(private readonly db: SalmodiaDatabase = defaultDb) {}
  async create(value: ServiceItem): Promise<void> { await this.db.serviceItems.add(value) }
  async getById(id: string): Promise<ServiceItem | undefined> { return this.db.serviceItems.get(id) }
  async listByServiceId(serviceId: string): Promise<ServiceItem[]> {
    return this.db.serviceItems.where('serviceId').equals(serviceId).sortBy('position')
  }
  async update(value: ServiceItem): Promise<void> { await this.db.serviceItems.put(value) }
  async remove(id: string): Promise<void> { await this.db.serviceItems.delete(id) }
}
export const serviceItemRepository = new ServiceItemRepository()
