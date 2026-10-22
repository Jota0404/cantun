import type { Service } from '../../domain/services/service'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'
import { MaterialRepository } from './materialRepository'
import { queueTargetDeleteAtomic, queueTargetUpsert } from '../../sync/syncService'

export class ServiceRepository {
  private readonly db: SalmodiaDatabase
  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }
  async create(value: Service): Promise<void> { await this.db.services.add(value); await queueTargetUpsert('services', value) }
  async getById(id: string): Promise<Service | undefined> { return this.db.services.get(id) }
  async listByOrganizationId(organizationId: string): Promise<Service[]> { return this.db.services.where('organizationId').equals(organizationId).sortBy('startsAt') }
  /** Só Dexie, sem fila: `status` muda por RPC (RN-03). */
  async putLocal(value: Service): Promise<void> { await this.db.services.put(value) }
  async update(value: Service): Promise<void> { await this.db.services.put(value); await queueTargetUpsert('services', value) }
  async remove(id: string): Promise<void> {
    // O banco apaga ensaios e materiais em cascata; localmente espelha os materiais do serviço e dos ensaios dele.
    const materials = new MaterialRepository(this.db)
    const rehearsalIds = (await this.db.rehearsals.where('serviceId').equals(id).primaryKeys()) as string[]
    await materials.removeLocalByOwner('rehearsalId', rehearsalIds)
    await materials.removeLocalByOwner('serviceId', [id])
    await queueTargetDeleteAtomic('services', id, [this.db.services], async () => { await this.db.services.delete(id) })
  }
}
export const serviceRepository = new ServiceRepository()
