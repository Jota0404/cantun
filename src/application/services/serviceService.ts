import { randomUUID } from 'crypto'
import type { Service } from '../../domain/services/service'
import type { ServiceItem } from '../../domain/services/serviceItem'
import type { Assignment } from '../../domain/services/assignment'
import { serviceRepository } from '../../db/repositories/serviceRepository'
import { serviceItemRepository } from '../../db/repositories/serviceItemRepository'
import { assignmentRepository } from '../../db/repositories/assignmentRepository'

export async function createService(input: Omit<Service, 'id' | 'createdAt' | 'updatedAt'>, id = randomUUID()): Promise<Service> {
  const now = new Date().toISOString()
  const service: Service = { ...input, id, createdAt: now, updatedAt: now }
  await serviceRepository.create(service)
  return service
}

export async function addServiceItem(input: Omit<ServiceItem, 'id' | 'updatedAt'>, id = randomUUID()): Promise<ServiceItem> {
  const item: ServiceItem = { ...input, id, updatedAt: new Date().toISOString() }
  await serviceItemRepository.create(item)
  return item
}

export async function createAssignment(input: Omit<Assignment, 'id' | 'createdAt' | 'updatedAt'>, id = randomUUID()): Promise<Assignment> {
  const now = new Date().toISOString()
  const assignment: Assignment = { ...input, id, createdAt: now, updatedAt: now }
  await assignmentRepository.create(assignment)
  return assignment
}
