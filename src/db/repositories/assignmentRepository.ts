import type { Assignment } from '../../domain/services/assignment'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'

/** Atribuições são do servidor (ADR-057): leitura do Dexie e `putLocal` com o retorno de RPC; nada entra na fila. */
export class AssignmentRepository {
  private readonly db: SalmodiaDatabase
  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }
  async putLocal(value: Assignment): Promise<void> { await this.db.assignments.put(value) }
  async removeLocalByServiceId(serviceId: string): Promise<void> { await this.db.assignments.where('serviceId').equals(serviceId).delete() }
  async getById(id: string): Promise<Assignment | undefined> { return this.db.assignments.get(id) }
  async listByServiceId(serviceId: string): Promise<Assignment[]> { return this.db.assignments.where('serviceId').equals(serviceId).toArray() }
  async listByPositionId(positionId: string): Promise<Assignment[]> { return this.db.assignments.where('positionId').equals(positionId).toArray() }
  async listByUserId(userId: string): Promise<Assignment[]> { return this.db.assignments.where('userId').equals(userId).toArray() }
}
export const assignmentRepository = new AssignmentRepository()
