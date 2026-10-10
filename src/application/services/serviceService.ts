import type { Service, ServiceStatus } from '../../domain/services/service'
import { canTransition, isFinalStatus } from '../../domain/services/serviceLifecycle'
import { getCurrentUser } from '../../platform/auth'
import { rpc } from '../../platform/rpc'
import type { Assignment } from '../../domain/services/assignment'
import { serviceRepository } from '../../db/repositories/serviceRepository'
import { serviceItemRepository } from '../../db/repositories/serviceItemRepository'
import { assignmentRepository } from '../../db/repositories/assignmentRepository'

export type ServiceResult = { success: true; service: Service } | { success: false; errors: string[] }

export interface ServiceInfoInput {
  name: string
  startsAt: string
  location?: string
  notes?: string
}

function validateInfo(input: Partial<ServiceInfoInput>): string[] {
  const errors: string[] = []
  if (input.name !== undefined && !input.name.trim()) errors.push('Informe o nome do serviço.')
  if (input.startsAt !== undefined && Number.isNaN(Date.parse(input.startsAt))) errors.push('Informe data e hora válidas.')
  return errors
}

const optional = (value: string | undefined) => value?.trim() || undefined

/** Nasce `draft` (RN-02), sempre com equipe (RN-01). */
export async function createService(
  input: ServiceInfoInput & { organizationId: string; teamId: string },
  repository = serviceRepository,
  id = crypto.randomUUID(),
): Promise<ServiceResult> {
  const user = getCurrentUser()
  const errors = validateInfo(input)
  if (!input.teamId) errors.push('Escolha a equipe do serviço.')
  if (!user) errors.push('Entre na sua conta para criar o serviço.')
  if (errors.length || !user) return { success: false, errors }
  const now = new Date().toISOString()
  const service: Service = {
    id, organizationId: input.organizationId, teamId: input.teamId, name: input.name.trim(), startsAt: input.startsAt,
    location: optional(input.location), notes: optional(input.notes), status: 'draft', createdByUserId: user.id, createdAt: now, updatedAt: now,
  }
  await repository.create(service)
  return { success: true, service }
}

/** RN-06: serviço final não é editado. */
export async function updateServiceInfo(serviceId: string, patch: Partial<ServiceInfoInput>, repository = serviceRepository): Promise<ServiceResult> {
  const current = await repository.getById(serviceId)
  if (!current) return { success: false, errors: ['Serviço não encontrado.'] }
  if (isFinalStatus(current.status)) return { success: false, errors: ['Serviço encerrado não pode ser editado.'] }
  const errors = validateInfo(patch)
  if (errors.length) return { success: false, errors }
  const service: Service = {
    ...current,
    name: patch.name?.trim() ?? current.name,
    startsAt: patch.startsAt ?? current.startsAt,
    location: 'location' in patch ? optional(patch.location) : current.location,
    notes: 'notes' in patch ? optional(patch.notes) : current.notes,
    updatedAt: new Date().toISOString(),
  }
  await repository.update(service)
  return { success: true, service }
}

/** Online: só a RPC muda `status` (RN-03). Recusa do servidor não altera o estado local. */
export async function transitionService(serviceId: string, to: ServiceStatus, repository = serviceRepository): Promise<ServiceResult> {
  const current = await repository.getById(serviceId)
  if (!current) return { success: false, errors: ['Serviço não encontrado.'] }
  if (!canTransition(current.status, to)) return { success: false, errors: ['Mudança de estado não permitida.'] }
  try {
    const data = await rpc('transition_service', { p_service_id: serviceId, p_to: to })
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
    const service: Service = { ...current, status: to, updatedAt: typeof row?.updated_at === 'string' ? row.updated_at : new Date().toISOString() }
    await repository.putLocal(service)
    return { success: true, service }
  } catch (error) {
    return { success: false, errors: [error instanceof Error && error.message ? error.message : 'Não foi possível mudar o estado do serviço.'] }
  }
}

export interface ServiceGroups {
  /** `ready` e `in_progress`, por data crescente. */
  upcoming: Service[]
  /** `draft`, por data crescente. */
  planning: Service[]
  /** `completed` e `cancelled`, do mais recente ao mais antigo. */
  past: Service[]
}

/** RN-09: lista agrupada, sem grade de calendário. */
export async function listServices(organizationId: string, repository = serviceRepository): Promise<ServiceGroups> {
  const services = await repository.listByOrganizationId(organizationId)
  const byDate = (a: Service, b: Service) => a.startsAt.localeCompare(b.startsAt)
  return {
    upcoming: services.filter((s) => s.status === 'ready' || s.status === 'in_progress').sort(byDate),
    planning: services.filter((s) => s.status === 'draft').sort(byDate),
    past: services.filter((s) => isFinalStatus(s.status)).sort((a, b) => byDate(b, a)),
  }
}

/** Do Dexie (offline). */
export function getService(serviceId: string, repository = serviceRepository): Promise<Service | undefined> {
  return repository.getById(serviceId)
}

/** Escala do serviço, do Dexie (offline). */
export function listServiceAssignments(serviceId: string, repository = assignmentRepository): Promise<Assignment[]> {
  return repository.listByServiceId(serviceId)
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
