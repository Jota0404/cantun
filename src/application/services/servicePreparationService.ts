import type { AccessContext } from '../../domain/access/permissions'
import { isFinalStatus } from '../../domain/services/serviceLifecycle'
import { preparationId } from '../../domain/services/servicePreparation'
import { servicePreparationRepository } from '../../db/repositories/servicePreparationRepository'
import { serviceRepository } from '../../db/repositories/serviceRepository'
import { teamMembershipRepository } from '../../db/repositories/teamRepository'
import { getCurrentUser } from '../../platform/auth'
import { getMemberDisplayNames, getMyAccessContext } from '../teams/teamMemberService'

export interface PreparationRepositories {
  services: typeof serviceRepository
  preparations: typeof servicePreparationRepository
  memberships: typeof teamMembershipRepository
  access: (input: { organizationId: string; teamId?: string }) => Promise<AccessContext>
  currentUserId: () => string | undefined
  displayNames: (organizationId: string) => Promise<Record<string, string>>
}

export const defaultPreparationRepositories: PreparationRepositories = {
  services: serviceRepository, preparations: servicePreparationRepository, memberships: teamMembershipRepository,
  access: getMyAccessContext, currentUserId: () => getCurrentUser()?.id, displayNames: getMemberDisplayNames,
}

/** RN-16: membro ativo da equipe do serviço e serviço fora de completed/cancelled. */
export function canPrepareService(service: { status: Parameters<typeof isFinalStatus>[0]; teamId?: string | null }, access: AccessContext): boolean {
  return !isFinalStatus(service.status) && Boolean(service.teamId) && access.teamRole != null && access.teamStatus === 'active'
}

export type SetPreparationResult = { success: true } | { success: false; errors: string[] }

/** RN-16: só a própria pessoa, membro ativo da equipe, serviço fora de completed/cancelled. Offline ok (classe A). */
export async function setPreparation(serviceId: string, prepared: boolean, repositories = defaultPreparationRepositories): Promise<SetPreparationResult> {
  const userId = repositories.currentUserId()
  if (!userId) return { success: false, errors: ['Entre na sua conta para continuar.'] }
  const service = await repositories.services.getById(serviceId)
  if (!service) return { success: false, errors: ['Serviço não encontrado.'] }
  if (isFinalStatus(service.status)) return { success: false, errors: ['Serviço encerrado não aceita alteração.'] }
  const access = await repositories.access({ organizationId: service.organizationId, teamId: service.teamId ?? undefined })
  if (!canPrepareService(service, access)) return { success: false, errors: ['Só membros ativos da equipe podem marcar preparação.'] }
  const id = preparationId(serviceId, userId)
  if (!prepared) await repositories.preparations.remove(id)
  else if (!(await repositories.preparations.get(id))) {
    const now = new Date().toISOString()
    await repositories.preparations.put({ id, serviceId, userId, preparedAt: now, updatedAt: now })
  }
  return { success: true }
}

export interface PreparationSummary {
  canSeeTeam: boolean
  preparedCount: number
  totalCount: number
  people: { userId: string; name: string; prepared: boolean }[]
}

export type PreparationSummaryResult = { success: true; summary: PreparationSummary } | { success: false; errors: string[] }

/** RN-17: só Owner/Admin/Líder ativo veem a equipe. Linhas dos outros só existem no Dexie se a RLS as entregou no pull. */
export async function getPreparationSummary(serviceId: string, repositories = defaultPreparationRepositories): Promise<PreparationSummaryResult> {
  const service = await repositories.services.getById(serviceId)
  if (!service) return { success: false, errors: ['Serviço não encontrado.'] }
  const access = await repositories.access({ organizationId: service.organizationId, teamId: service.teamId ?? undefined })
  const canSeeTeam = access.organizationRole === 'owner' || access.organizationRole === 'admin' || (access.teamRole === 'leader' && access.teamStatus === 'active')
  if (!canSeeTeam || !service.teamId) return { success: true, summary: { canSeeTeam: false, preparedCount: 0, totalCount: 0, people: [] } }
  const [members, rows, names] = await Promise.all([
    repositories.memberships.listByTeamId(service.teamId), repositories.preparations.listByServiceId(serviceId), repositories.displayNames(service.organizationId),
  ])
  const done = new Set(rows.map((row) => row.userId))
  const people = members.filter((m) => m.status === 'active').map((m) => ({ userId: m.userId, name: names[m.userId] ?? 'Participante', prepared: done.has(m.userId) })).sort((a, b) => a.name.localeCompare(b.name))
  return { success: true, summary: { canSeeTeam: true, preparedCount: people.filter((p) => p.prepared).length, totalCount: people.length, people } }
}
