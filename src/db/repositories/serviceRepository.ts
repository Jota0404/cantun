import type { Service } from '../../domain/services/service'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'

export class ServiceRepository {
  constructor(private readonly db: SalmodiaDatabase = defaultDb) {}

  async create(value: Service): Promise<void> { await this.db.services.add(value) }
  async getById(id: string): Promise<Service | undefined> { return this.db.services.get(id) }
  async listByOrganizationId(organizationId: string): Promise<Service[]> {
    return this.db.services.where('organizationId').equals(organizationId).sortBy('startsAt')
  }
  async update(value: Service): Promise<void> { await this.db.services.put(value) }
  async remove(id: string): Promise<void> { await this.db.services.delete(id) }
}
export const serviceRepository = new ServiceRepository()
