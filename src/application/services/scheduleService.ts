import { assignmentRepository } from '../../db/repositories/assignmentRepository'
import { memberAvailabilityRepository } from '../../db/repositories/memberAvailabilityRepository'
import { serviceItemRepository } from '../../db/repositories/serviceItemRepository'
import { servicePositionRepository } from '../../db/repositories/servicePositionRepository'
import { serviceRepository } from '../../db/repositories/serviceRepository'
import { songRepository } from '../../db/repositories/songRepository'
import { toAssignment, type Assignment } from '../../domain/services/assignment'
import { holdsPosition } from '../../domain/services/assignmentLifecycle'
import { availabilityDate, validateAvailability, type AvailabilityStatus, type MemberAvailability } from '../../domain/services/memberAvailability'
import { serviceGaps, type PositionGap } from '../../domain/services/positionGap'
import type { Service } from '../../domain/services/service'
import { isFinalStatus } from '../../domain/services/serviceLifecycle'
import { validatePosition, type ServicePosition } from '../../domain/services/servicePosition'
import { suggestMembers, type MemberSuggestion } from '../../domain/services/suggestMembers'
import { getCurrentUser } from '../../platform/auth'
import { ApiError, apiRequest } from '../../platform/http'
import { rpc } from '../../platform/rpc'
import { hasPermission } from '../../domain/access/permissions'
import { organizationRepository } from '../../db/repositories/organizationRepository'
import { getMyAccessContext, listTeamMembers } from '../teams/teamMemberService'

export type Failure = { success: false; errors: string[] }
const fail = (...errors: string[]): Failure => ({ success: false, errors })
const message = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback

// ---- Vagas (offline, fila LWW) ---------------------------------------------------------

async function editableService(serviceId: string): Promise<Service | string> {
  const service = await serviceRepository.getById(serviceId)
  if (!service) return 'Serviço não encontrado.'
  return isFinalStatus(service.status) ? 'Serviço encerrado não aceita mudanças na escala.' : service
}

export function listPositions(serviceId: string): Promise<ServicePosition[]> {
  return servicePositionRepository.listByServiceId(serviceId)
}

export function listAssignments(serviceId: string): Promise<Assignment[]> {
  return assignmentRepository.listByServiceId(serviceId)
}

export async function createPosition(
  input: { serviceId: string; musicalFunction: string; quantity: number; notes?: string },
  id = crypto.randomUUID(),
): Promise<{ success: true; position: ServicePosition } | Failure> {
  const service = await editableService(input.serviceId)
  if (typeof service === 'string') return fail(service)
  const errors = validatePosition(input)
  if (errors.length) return fail(...errors)
  const existing = await servicePositionRepository.listByServiceId(input.serviceId)
  if (existing.some((position) => position.musicalFunction === input.musicalFunction)) return fail('Já existe uma vaga para esta função; aumente a quantidade.')
  const now = new Date().toISOString()
  const position: ServicePosition = { id, serviceId: input.serviceId, musicalFunction: input.musicalFunction, quantity: input.quantity, notes: input.notes?.trim() || undefined, createdAt: now, updatedAt: now }
  await servicePositionRepository.create(position)
  return { success: true, position }
}

/** RN-09: a quantidade não cai abaixo das atribuições ativas e a função só muda sem atribuições. */
export async function updatePosition(
  positionId: string,
  patch: { musicalFunction?: string; quantity?: number; notes?: string },
): Promise<{ success: true; position: ServicePosition } | Failure> {
  const current = await servicePositionRepository.getById(positionId)
  if (!current) return fail('Vaga não encontrada.')
  const service = await editableService(current.serviceId)
  if (typeof service === 'string') return fail(service)
  const next = {
    musicalFunction: patch.musicalFunction ?? current.musicalFunction,
    quantity: patch.quantity ?? current.quantity,
    notes: 'notes' in patch ? patch.notes : current.notes,
  }
  const errors = validatePosition(next)
  if (errors.length) return fail(...errors)
  const assignments = await assignmentRepository.listByPositionId(positionId)
  const active = assignments.filter((a) => a.status === 'invited' || a.status === 'confirmed').length
  if (next.quantity < active) return fail('A quantidade não pode ficar abaixo das pessoas já escaladas.')
  if (next.musicalFunction !== current.musicalFunction) {
    if (assignments.some((a) => holdsPosition(a.status))) return fail('A função não muda enquanto houver pessoas escaladas.')
    const siblings = await servicePositionRepository.listByServiceId(current.serviceId)
    if (siblings.some((p) => p.id !== positionId && p.musicalFunction === next.musicalFunction)) return fail('Já existe uma vaga para esta função.')
  }
  const position: ServicePosition = { ...current, ...next, notes: next.notes?.trim() || undefined, updatedAt: new Date().toISOString() }
  await servicePositionRepository.update(position)
  return { success: true, position }
}

/** Vaga com qualquer atribuição não é excluída (cancele antes; o servidor devolve 409). */
export async function removePosition(positionId: string): Promise<{ success: true } | Failure> {
  const current = await servicePositionRepository.getById(positionId)
  if (!current) return fail('Vaga não encontrada.')
  const service = await editableService(current.serviceId)
  if (typeof service === 'string') return fail(service)
  if ((await assignmentRepository.listByPositionId(positionId)).length > 0) return fail('Cancele as pessoas escaladas antes de excluir a vaga.')
  await servicePositionRepository.remove(positionId)
  return { success: true }
}

/** RN-06: lacunas por vaga; "convidados aguardando" separado de "sem convite". */
export async function getServiceGaps(serviceId: string) {
  const [positions, assignments] = await Promise.all([listPositions(serviceId), listAssignments(serviceId)])
  return serviceGaps(positions, assignments)
}

// ---- Atribuições (só online, por RPC; ADR-057) ------------------------------------------

export type AssignmentResult = { success: true; assignment: Assignment } | Failure

async function callAssignmentRpc(name: string, params: Record<string, unknown>, replacedId?: string): Promise<AssignmentResult> {
  try {
    const data = await rpc<Record<string, unknown> | Record<string, unknown>[] | null>(name, params)
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return fail('Resposta inválida do servidor.')
    const assignment = toAssignment(row)
    await assignmentRepository.putLocal(assignment)
    if (replacedId) {
      const old = await assignmentRepository.getById(replacedId)
      if (old) await assignmentRepository.putLocal({ ...old, status: 'cancelled', updatedAt: assignment.updatedAt })
    }
    return { success: true, assignment }
  } catch (error) {
    return fail(message(error, 'Não foi possível atualizar a escala.'))
  }
}

export const assignMember = (positionId: string, userId: string) => callAssignmentRpc('assign_member', { p_position_id: positionId, p_user_id: userId })
/** Só o titular (RN-04). */
export const confirmAssignment = (assignmentId: string) => callAssignmentRpc('respond_to_assignment', { p_assignment_id: assignmentId, p_response: 'confirm' })
export const declineAssignment = (assignmentId: string) => callAssignmentRpc('respond_to_assignment', { p_assignment_id: assignmentId, p_response: 'decline' })
export const requestReplacement = (assignmentId: string) => callAssignmentRpc('request_replacement', { p_assignment_id: assignmentId })
/** Devolve a nova atribuição `invited`; a anterior vira `cancelled`. */
export const replaceAssignment = (assignmentId: string, newUserId: string) => callAssignmentRpc('replace_assignment', { p_assignment_id: assignmentId, p_new_user_id: newUserId }, assignmentId)
export const cancelAssignment = (assignmentId: string) => callAssignmentRpc('cancel_assignment', { p_assignment_id: assignmentId })

/** Reenvia o e-mail do convite (online; o servidor limita a 1 por minuto). */
export async function resendAssignmentInvite(assignmentId: string): Promise<{ success: true } | Failure> {
  try {
    await apiRequest<void>('POST', `/schedule/assignments/${encodeURIComponent(assignmentId)}/resend-invite`)
    return { success: true }
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) return fail('Aguarde um minuto para reenviar o convite.')
    return fail(message(error, 'Não foi possível reenviar o convite.'))
  }
}

// ---- Disponibilidade por dia (offline, fila LWW) ----------------------------------------

/** Só o próprio usuário escreve (RN-10). Reaproveita o registro do dia (único por usuário, organização e data). */
export async function setMyAvailability(input: { organizationId: string; date: string; status: AvailabilityStatus; note?: string }): Promise<{ success: true; availability: MemberAvailability } | Failure> {
  const user = getCurrentUser()
  if (!user) return fail('Entre na sua conta para informar a disponibilidade.')
  const errors = validateAvailability(input)
  if (errors.length) return fail(...errors)
  const now = new Date().toISOString()
  const existing = await memberAvailabilityRepository.findByUserAndDate(user.id, input.organizationId, input.date)
  const availability: MemberAvailability = {
    id: existing?.id ?? crypto.randomUUID(), userId: user.id, organizationId: input.organizationId, date: input.date,
    status: input.status, note: input.note?.trim() || undefined, createdAt: existing?.createdAt ?? now, updatedAt: now,
  }
  await memberAvailabilityRepository.put(availability)
  return { success: true, availability }
}

export async function clearMyAvailability(organizationId: string, date: string): Promise<void> {
  const user = getCurrentUser()
  const existing = user ? await memberAvailabilityRepository.findByUserAndDate(user.id, organizationId, date) : undefined
  if (existing) await memberAvailabilityRepository.remove(existing.id)
}

export function listMyAvailability(organizationId: string): Promise<MemberAvailability[]> {
  const user = getCurrentUser()
  return user ? memberAvailabilityRepository.listByUser(user.id, organizationId) : Promise.resolve([])
}

// ---- Leituras compostas (offline) -------------------------------------------------------

export interface MyUpcomingAssignment {
  assignment: Assignment
  service: Service
  songTitles: string[]
}

/** O que preciso fazer e onde: serviços não encerrados, do mais próximo ao mais distante (§18.5). */
export async function listMyUpcomingAssignments(now = new Date()): Promise<MyUpcomingAssignment[]> {
  const user = getCurrentUser()
  if (!user) return []
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const mine = (await assignmentRepository.listByUserId(user.id)).filter((assignment) => holdsPosition(assignment.status))
  const result: MyUpcomingAssignment[] = []
  for (const assignment of mine) {
    const service = await serviceRepository.getById(assignment.serviceId)
    if (!service || isFinalStatus(service.status) || service.startsAt < startOfToday) continue
    const items = (await serviceItemRepository.listByServiceId(service.id)).filter((item) => item.type === 'song' && item.songId)
    const songs = await Promise.all(items.map((item) => songRepository.getById(item.songId as string)))
    result.push({ assignment, service, songTitles: songs.flatMap((song) => song ? [song.title] : []) })
  }
  return result.sort((a, b) => a.service.startsAt.localeCompare(b.service.startsAt))
}

export interface ManagedServiceGap {
  service: Service
  openCount: number
  missingTotal: number
}

/** Serviços futuros e não encerrados, das equipes que o usuário gerencia (`schedule.manage`), com vagas abertas. */
export async function listManagedServiceGaps(now = new Date()): Promise<ManagedServiceGap[]> {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const manageable = new Map<string, boolean>()
  const result: ManagedServiceGap[] = []
  for (const organization of await organizationRepository.list()) {
    for (const service of await serviceRepository.listByOrganizationId(organization.id)) {
      if (isFinalStatus(service.status) || service.startsAt < startOfToday || !service.teamId) continue
      const key = `${organization.id}:${service.teamId}`
      if (!manageable.has(key)) manageable.set(key, hasPermission(await getMyAccessContext({ organizationId: organization.id, teamId: service.teamId }), 'schedule.manage'))
      if (!manageable.get(key)) continue
      const { openCount, missingTotal } = await getServiceGaps(service.id)
      if (openCount > 0) result.push({ service, openCount, missingTotal })
    }
  }
  return result.sort((a, b) => a.service.startsAt.localeCompare(b.service.startsAt))
}

export interface NamedSuggestion extends MemberSuggestion {
  displayName: string
}

/** RN-12: membros ativos da equipe do serviço, sem quem recusou esta vaga; a disponibilidade só sugere. */
export async function suggestForPosition(positionId: string): Promise<NamedSuggestion[]> {
  const position = await servicePositionRepository.getById(positionId)
  const service = position ? await serviceRepository.getById(position.serviceId) : undefined
  if (!position || !service?.teamId) return []
  const [members, positionAssignments, availability] = await Promise.all([
    listTeamMembers({ organizationId: service.organizationId, teamId: service.teamId }),
    assignmentRepository.listByPositionId(positionId),
    memberAvailabilityRepository.listByOrganizationAndDate(service.organizationId, availabilityDate(service.startsAt)),
  ])
  const active = members.filter((member) => member.userId && member.displayStatus === 'active')
  const sameTime = (await serviceRepository.listByOrganizationId(service.organizationId)).filter((other) => other.id !== service.id && other.startsAt === service.startsAt && !isFinalStatus(other.status))
  const busy = new Set<string>()
  for (const other of sameTime) for (const assignment of await assignmentRepository.listByServiceId(other.id)) if (holdsPosition(assignment.status)) busy.add(assignment.userId)
  const names = new Map(active.map((member) => [member.userId as string, member.displayName]))
  return suggestMembers({
    candidates: active.map((member) => ({ userId: member.userId as string, functions: member.musicalFunctions })),
    musicalFunction: position.musicalFunction,
    positionAssignments,
    availabilityByUser: Object.fromEntries(availability.map((item) => [item.userId, item.status])),
    busyUserIds: busy,
  }).map((suggestion) => ({ ...suggestion, displayName: names.get(suggestion.userId) ?? 'Participante' }))
}

export type { PositionGap }
