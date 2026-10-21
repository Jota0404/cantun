import { hasPermission, type AccessContext } from '../../domain/access/permissions'
import { repriseTitle, validateRepriseTarget, validateServiceItem, type ServiceItem } from '../../domain/services/serviceItem'
import { isFinalStatus } from '../../domain/services/serviceLifecycle'
import { songRepository } from '../../db/repositories/songRepository'
import { serviceItemRepository } from '../../db/repositories/serviceItemRepository'
import { serviceRepository } from '../../db/repositories/serviceRepository'
import { getMyAccessContext } from '../teams/teamMemberService'

export interface AddRepriseRepositories {
  items: typeof serviceItemRepository
  songs: typeof songRepository
  services: typeof serviceRepository
  access: (input: { organizationId: string; teamId?: string }) => Promise<AccessContext>
}

const defaults: AddRepriseRepositories = { items: serviceItemRepository, songs: songRepository, services: serviceRepository, access: getMyAccessContext }

export type AddRepriseResult = { success: true; item: ServiceItem } | { success: false; errors: string[] }

/** RN-10: acrescenta ao fim da ordem uma reprise/medley que volta a um item `song` do mesmo serviço. */
export async function addReprise(
  serviceId: string,
  input: { type: 'reprise' | 'medley'; refItemId: string },
  repositories = defaults,
  id = crypto.randomUUID(),
): Promise<AddRepriseResult> {
  const service = await repositories.services.getById(serviceId)
  if (!service) return { success: false, errors: ['Serviço não encontrado.'] }
  if (isFinalStatus(service.status)) return { success: false, errors: ['Serviço encerrado não pode ser editado.'] }
  const access = await repositories.access({ organizationId: service.organizationId, teamId: service.teamId ?? undefined })
  if (!hasPermission(access, 'service.edit')) return { success: false, errors: ['Você não tem permissão para editar a ordem deste serviço.'] }

  const items = await repositories.items.listByServiceId(serviceId)
  const targetErrors = validateRepriseTarget(serviceId, input.refItemId, items)
  if (targetErrors.length) return { success: false, errors: targetErrors }
  const target = items.find((item) => item.id === input.refItemId)
  const song = target?.songId ? await repositories.songs.getById(target.songId) : undefined
  if (!song) return { success: false, errors: ['Música indisponível neste aparelho. Sincronize e tente de novo.'] }

  const title = repriseTitle(input.type, song.title)
  const errors = validateServiceItem({ type: input.type, title, refItemId: input.refItemId })
  if (errors.length) return { success: false, errors }
  const item: ServiceItem = { id, serviceId, type: input.type, title, refItemId: input.refItemId, position: items.length, updatedAt: new Date().toISOString() }
  await repositories.items.create(item)
  await repositories.services.update({ ...service, updatedAt: item.updatedAt })
  return { success: true, item }
}
