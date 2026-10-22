import type { AccessContext } from '../../domain/access/permissions'
import { hasPermission } from '../../domain/access/permissions'
import type { Rehearsal } from '../../domain/services/rehearsal'
import { validateRehearsal } from '../../domain/services/rehearsal'
import { isFinalStatus } from '../../domain/services/serviceLifecycle'
import { rehearsalRepository } from '../../db/repositories/rehearsalRepository'
import { serviceItemRepository } from '../../db/repositories/serviceItemRepository'
import { serviceRepository } from '../../db/repositories/serviceRepository'
import { songRepository } from '../../db/repositories/songRepository'
import { getMyAccessContext } from '../teams/teamMemberService'

export type RehearsalView = { id: string; serviceId: string; startsAt: string; location?: string; notes?: string; songs: { serviceItemId: string; title: string; position: number }[] }
export type RehearsalInput = { startsAt: string; location?: string; notes?: string; serviceItemIds: string[] }

export interface RehearsalRepositories {
  rehearsals: typeof rehearsalRepository
  services: typeof serviceRepository
  items: typeof serviceItemRepository
  songs: typeof songRepository
  access: (input: { organizationId: string; teamId?: string }) => Promise<AccessContext>
}

export const defaultRehearsalRepositories: RehearsalRepositories = {
  rehearsals: rehearsalRepository, services: serviceRepository, items: serviceItemRepository, songs: songRepository, access: getMyAccessContext,
}

type Fail = { success: false; errors: string[] }
const fail = (message: string): Fail => ({ success: false, errors: [message] })

/** Ensaios do serviço com as músicas em foco na ordem do serviço. Também usado pela visão do membro (sem checar acesso). */
export async function buildRehearsalViews(serviceId: string, repositories = defaultRehearsalRepositories): Promise<RehearsalView[]> {
  const [rows, items] = await Promise.all([repositories.rehearsals.listByServiceId(serviceId), repositories.items.listByServiceId(serviceId)])
  const views: RehearsalView[] = []
  for (const row of rows) {
    const focus = new Set((await repositories.rehearsals.listSongs(row.id)).map((s) => s.serviceItemId))
    const songs = await Promise.all(items.filter((i) => i.type === 'song' && focus.has(i.id)).map(async (item, index) => {
      const song = item.songId ? await repositories.songs.getById(item.songId) : undefined
      return { serviceItemId: item.id, title: song?.title ?? item.title ?? 'Música indisponível offline', position: index + 1 }
    }))
    views.push({ id: row.id, serviceId, startsAt: row.startsAt, location: row.location, notes: row.notes, songs })
  }
  return views
}

async function writable(serviceId: string, repositories: RehearsalRepositories) {
  const service = await repositories.services.getById(serviceId)
  if (!service) return fail('Serviço não encontrado.')
  const access = await repositories.access({ organizationId: service.organizationId, teamId: service.teamId ?? undefined })
  if (!hasPermission(access, 'rehearsal.manage')) return fail('Você não tem permissão para gerenciar ensaios.')
  if (isFinalStatus(service.status)) return fail('Serviço encerrado não aceita alteração.')
  return service
}

export async function listRehearsals(serviceId: string, repositories = defaultRehearsalRepositories): Promise<{ success: true; rehearsals: RehearsalView[]; canManage: boolean } | Fail> {
  const service = await repositories.services.getById(serviceId)
  if (!service) return fail('Serviço não encontrado.')
  const access = await repositories.access({ organizationId: service.organizationId, teamId: service.teamId ?? undefined })
  if (!access.organizationRole || access.isActiveInOrganization === false) return fail('Você não tem acesso a este serviço.')
  return { success: true, rehearsals: await buildRehearsalViews(serviceId, repositories), canManage: hasPermission(access, 'rehearsal.manage') && !isFinalStatus(service.status) }
}

async function save(existing: Rehearsal | undefined, serviceId: string, input: RehearsalInput, repositories: RehearsalRepositories): Promise<{ success: true; rehearsal: RehearsalView } | Fail> {
  const service = await writable(serviceId, repositories)
  if ('success' in service) return service
  const errors = validateRehearsal(input, await repositories.items.listByServiceId(serviceId))
  if (errors.length) return { success: false, errors }
  const now = new Date().toISOString()
  const value: Rehearsal = {
    id: existing?.id ?? crypto.randomUUID(), organizationId: service.organizationId, serviceId, startsAt: new Date(input.startsAt).toISOString(),
    location: input.location?.trim() || undefined, notes: input.notes?.trim() || undefined, createdAt: existing?.createdAt ?? now, updatedAt: now,
  }
  await repositories.rehearsals.save(value, input.serviceItemIds)
  const rehearsal = (await buildRehearsalViews(serviceId, repositories)).find((r) => r.id === value.id)
  return rehearsal ? { success: true, rehearsal } : fail('Não foi possível salvar o ensaio.')
}

export async function createRehearsal(serviceId: string, input: RehearsalInput, repositories = defaultRehearsalRepositories) {
  return save(undefined, serviceId, input, repositories)
}

export async function updateRehearsal(rehearsalId: string, input: RehearsalInput, repositories = defaultRehearsalRepositories) {
  const existing = await repositories.rehearsals.get(rehearsalId)
  if (!existing) return fail('Ensaio não encontrado.')
  return save(existing, existing.serviceId, input, repositories)
}

export async function deleteRehearsal(rehearsalId: string, repositories = defaultRehearsalRepositories): Promise<{ success: true } | Fail> {
  const existing = await repositories.rehearsals.get(rehearsalId)
  if (!existing) return fail('Ensaio não encontrado.')
  const service = await writable(existing.serviceId, repositories)
  if ('success' in service) return service
  await repositories.rehearsals.remove(rehearsalId)
  return { success: true }
}
