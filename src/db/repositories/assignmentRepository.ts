import type { Assignment } from '../../domain/services/assignment'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'
import { queueTargetDelete, queueTargetUpsert } from '../../sync/syncService'

export class AssignmentRepository {
  constructor(private readonly db: SalmodiaDatabase = defaultDb) {}
  async create(value: Assignment): Promise<void> { await this.db.assignments.add(value); await queueTargetUpsert('assignments', value) }
  async getById(id: string): Promise<Assignment | undefined> { return this.db.assignments.get(id) }
  async listByServiceId(serviceId: string): Promise<Assignment[]> { return this.db.assignments.where('serviceId').equals(serviceId).toArray() }
  async listByUserId(userId: string): Promise<Assignment[]> { return this.db.assignments.where('userId').equals(userId).toArray() }
  async update(value: Assignment): Promise<void> { await this.db.assignments.put(value); await queueTargetUpsert('assignments', value) }
  async remove(id: string): Promise<void> { await this.db.assignments.delete(id); await queueTargetDelete('assignments', id) }
}
export const assignmentRepository = new AssignmentRepository()
