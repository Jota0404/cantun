import type { Repertoire } from '../../domain/repertoires/repertoire'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'

export class RepertoireRepository {
  private readonly db: SalmodiaDatabase

  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }

  async create(value: Repertoire): Promise<void> { await this.db.repertoires.add(value) }
  async getById(id: string): Promise<Repertoire | undefined> { return this.db.repertoires.get(id) }
  async listByOrganizationId(organizationId: string): Promise<Repertoire[]> {
    return this.db.repertoires.where('organizationId').equals(organizationId).sortBy('updatedAt')
  }
  async update(value: Repertoire): Promise<void> { await this.db.repertoires.put(value) }
  async remove(id: string): Promise<void> { await this.db.repertoires.delete(id) }
}

export const repertoireRepository = new RepertoireRepository()
