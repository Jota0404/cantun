import type { RepertoireItem } from '../../domain/repertoires/repertoireItem'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'
import { queueTargetDelete, queueTargetUpsert } from '../../sync/syncService'

export class RepertoireItemRepository {
  private readonly db: SalmodiaDatabase
  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }
  async create(value: RepertoireItem): Promise<void> { await this.db.repertoireItems.add(value); await queueTargetUpsert('repertoireItems', value) }
  async getById(id: string): Promise<RepertoireItem | undefined> { return this.db.repertoireItems.get(id) }
  async listByRepertoireId(repertoireId: string): Promise<RepertoireItem[]> { return this.db.repertoireItems.where('repertoireId').equals(repertoireId).sortBy('position') }
  async listBySongId(songId: string): Promise<RepertoireItem[]> { return this.db.repertoireItems.where('songId').equals(songId).toArray() }
  async findByRepertoireAndSong(repertoireId: string, songId: string): Promise<RepertoireItem | undefined> { return this.db.repertoireItems.where('[repertoireId+songId]').equals([repertoireId, songId]).first() }
  async update(value: RepertoireItem): Promise<void> { await this.db.repertoireItems.put(value); await queueTargetUpsert('repertoireItems', value) }
  async remove(id: string): Promise<void> { await this.db.repertoireItems.delete(id); await queueTargetDelete('repertoireItems', id) }
}
export const repertoireItemRepository = new RepertoireItemRepository()
