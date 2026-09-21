import type { StageSessionState } from '../../domain/stage/stageSessionState'
import { db as defaultDb, type SalmodiaDatabase } from '../database'

export class StageSessionStateRepository {
  private readonly db: SalmodiaDatabase
  constructor(db: SalmodiaDatabase = defaultDb) { this.db = db }
  async getByStageSessionId(stageSessionId: string) { return this.db.stageSessionStates.get(stageSessionId) }
  async put(value: StageSessionState) { await this.db.stageSessionStates.put(value) }
}
export const stageSessionStateRepository = new StageSessionStateRepository()
