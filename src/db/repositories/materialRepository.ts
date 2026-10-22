import type { Material } from '../../domain/services/material'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'
import { queueTargetDeleteAtomic, queueTargetUpserts } from '../../sync/syncService'

export type MaterialOwnerField = 'serviceId' | 'rehearsalId' | 'songId'

export class MaterialRepository {
  private readonly db: SalmodiaDatabase
  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }
  async get(id: string): Promise<Material | undefined> { return this.db.materials.get(id) }
  async listByOwner(field: MaterialOwnerField, ownerId: string): Promise<Material[]> {
    return (await this.db.materials.where(field).equals(ownerId).toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
  async save(value: Material): Promise<void> {
    await queueTargetUpserts('materials', [value], [this.db.materials], async () => { await this.db.materials.put(value) })
  }
  async remove(id: string): Promise<void> {
    await queueTargetDeleteAtomic('materials', id, [this.db.materials], async () => { await this.db.materials.delete(id) })
  }
  /** O banco apaga em cascata; localmente espelha o efeito (sem delete na fila) e descarta pendências desses materiais. */
  async removeLocalByOwner(field: MaterialOwnerField, ownerIds: string[]): Promise<void> {
    await this.db.transaction('rw', [this.db.materials, this.db.targetSyncQueue], async () => {
      const ids = (await this.db.materials.where(field).anyOf(ownerIds).primaryKeys()) as string[]
      await this.db.materials.bulkDelete(ids)
      await this.db.targetSyncQueue.filter((i) => i.entity === 'materials' && ids.includes(i.entityId)).delete()
    })
  }
}
export const materialRepository = new MaterialRepository()
