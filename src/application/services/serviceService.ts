import type { Service } from '../../domain/services/service'
import type { ServiceItem } from '../../domain/services/serviceItem'
import type { Assignment } from '../../domain/services/assignment'
import { serviceRepository } from '../../db/repositories/serviceRepository'
import { serviceItemRepository } from '../../db/repositories/serviceItemRepository'
import { assignmentRepository } from '../../db/repositories/assignmentRepository'

export async function createService(
  input: Omit<Service, 'id' | 'createdAt' | 'updatedAt'>,
  id = crypto.randomUUID(),
): Promise<Service> {
  const now = new Date().toISOString()
  const service: Service = { ...input, id, createdAt: now, updatedAt: now }
  await serviceRepository.create(service)
  return service
}

export async function addServiceItem(
  input: Omit<ServiceItem, 'id' | 'updatedAt'>,
  id = crypto.randomUUID(),
): Promise<ServiceItem> {
  const item: ServiceItem = { ...input, id, updatedAt: new Date().toISOString() }
  await serviceItemRepository.create(item)
  return item
}

export async function createAssignment(
  input: Omit<Assignment, 'id' | 'createdAt' | 'updatedAt'>,
  id = crypto.randomUUID(),
): Promise<Assignment> {
  const now = new Date().toISOString()
  const assignment: Assignment = { ...input, id, createdAt: now, updatedAt: now }
  await assignmentRepository.create(assignment)
  return assignment
}

export async function updateAssignment(
  assignmentId: string,
  patch: Partial<Pick<Assignment, 'userId' | 'musicalFunction' | 'serviceItemId' | 'status'>>,
): Promise<Assignment> {
  const current = await assignmentRepository.getById(assignmentId)
  if (!current) throw new Error('Escala não encontrada.')

  const updated: Assignment = {
    ...current,
    ...patch,
    musicalFunction: patch.musicalFunction?.trim() || current.musicalFunction,
    updatedAt: new Date().toISOString(),
  }
  await assignmentRepository.update(updated)
  return updated
}

export async function removeAssignment(assignmentId: string): Promise<void> {
  await assignmentRepository.remove(assignmentId)
}

export async function removeService(serviceId: string): Promise<void> {
  const [items, assignments] = await Promise.all([
    serviceItemRepository.listByServiceId(serviceId),
    assignmentRepository.listByServiceId(serviceId),
  ])

  for (const item of items) await serviceItemRepository.remove(item.id)
  for (const assignment of assignments) await assignmentRepository.remove(assignment.id)
  await serviceRepository.remove(serviceId)
}
