import type { ServiceItem } from '../../domain/services/serviceItem'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'
import { queueTargetDelete, queueTargetUpsert, queueTargetUpserts } from '../../sync/syncService'

export class ServiceItemRepository {
  private readonly db: SalmodiaDatabase
  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }
  async create(value: ServiceItem): Promise<void> { await this.db.serviceItems.add(value); await queueTargetUpsert('serviceItems', value) }
  /** Grava e enfileira todos os itens atomicamente (renumeração em lote). */
  async saveMany(values: ServiceItem[]): Promise<void> {
    if (values.length) await queueTargetUpserts('serviceItems', values, [this.db.serviceItems], async () => { await this.db.serviceItems.bulkPut(values) })
  }
  async getById(id: string): Promise<ServiceItem | undefined> { return this.db.serviceItems.get(id) }
  async listByServiceId(serviceId: string): Promise<ServiceItem[]> { return this.db.serviceItems.where('serviceId').equals(serviceId).sortBy('position') }
  async update(value: ServiceItem): Promise<void> { await this.db.serviceItems.put(value); await queueTargetUpsert('serviceItems', value) }
  async remove(id: string): Promise<void> {
    // O banco apaga as linhas de ensaio em cascata; aqui só espelha o efeito local (sem fila).
    await this.db.transaction('rw', [this.db.serviceItems, this.db.rehearsalSongs, this.db.targetSyncQueue], async () => {
      await this.db.serviceItems.delete(id)
      await this.db.rehearsalSongs.where('serviceItemId').equals(id).delete()
      await this.db.targetSyncQueue.filter((i) => i.entity === 'rehearsalSongs' && i.entityId.endsWith(`:${id}`)).delete()
    })
    await queueTargetDelete('serviceItems', id)
  }
}
export const serviceItemRepository = new ServiceItemRepository()
