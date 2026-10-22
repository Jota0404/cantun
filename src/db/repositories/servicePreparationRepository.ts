import type { ServicePreparation } from '../../domain/services/servicePreparation'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'
import { queueTargetDeleteAtomic, queueTargetUpserts } from '../../sync/syncService'

export class ServicePreparationRepository {
  private readonly db: SalmodiaDatabase
  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }
  async put(value: ServicePreparation): Promise<void> { await queueTargetUpserts('servicePreparations', [value], [this.db.servicePreparations], async () => { await this.db.servicePreparations.put(value) }) }
  async remove(id: string): Promise<void> { await queueTargetDeleteAtomic('servicePreparations', id, [this.db.servicePreparations], async () => { await this.db.servicePreparations.delete(id) }) }
  async get(id: string): Promise<ServicePreparation | undefined> { return this.db.servicePreparations.get(id) }
  async listByServiceId(serviceId: string): Promise<ServicePreparation[]> { return this.db.servicePreparations.where('serviceId').equals(serviceId).toArray() }
}
export const servicePreparationRepository = new ServicePreparationRepository()
