import type { Repertoire } from '../../domain/repertoires/repertoire'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'
import { queueTargetDelete, queueTargetUpsert } from '../../sync/syncService'

export class RepertoireRepository {
  constructor(private readonly db: SalmodiaDatabase = defaultDb) {}
  async create(value: Repertoire): Promise<void> { await this.db.repertoires.add(value); await queueTargetUpsert('repertoires', value) }
  async getById(id: string): Promise<Repertoire | undefined> { return this.db.repertoires.get(id) }
  async listByOrganizationId(organizationId: string): Promise<Repertoire[]> { return this.db.repertoires.where('organizationId').equals(organizationId).sortBy('updatedAt') }
  async update(value: Repertoire): Promise<void> { await this.db.repertoires.put(value); await queueTargetUpsert('repertoires', value) }
  async remove(id: string): Promise<void> { await this.db.repertoires.delete(id); await queueTargetDelete('repertoires', id) }
}
export const repertoireRepository = new RepertoireRepository()
