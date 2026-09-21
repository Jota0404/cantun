import type { StageSession } from '../../domain/stage/stageSession'
import { db as defaultDb, type SalmodiaDatabase } from '../database'

export class StageSessionRepository {
  private readonly db: SalmodiaDatabase
  constructor(db: SalmodiaDatabase = defaultDb) { this.db = db }
  async getById(id: string) { return this.db.stageSessions.get(id) }
  async listByServiceId(serviceId: string) { return this.db.stageSessions.where('serviceId').equals(serviceId).toArray() }
  async put(value: StageSession) { await this.db.stageSessions.put(value) }
}
export const stageSessionRepository = new StageSessionRepository()
