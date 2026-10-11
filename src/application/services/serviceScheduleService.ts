import { isFinalStatus } from '../../domain/services/serviceLifecycle'
import { moveItem, renumber, validateServiceItem, type ServiceItem, type ServiceItemInput } from '../../domain/services/serviceItem'
import { serviceItemRepository } from '../../db/repositories/serviceItemRepository'
import { serviceRepository } from '../../db/repositories/serviceRepository'

export type ServiceItemsResult = { success: true; items: ServiceItem[] } | { success: false; errors: string[] }

export interface ServiceScheduleRepositories {
  items: typeof serviceItemRepository
  services: typeof serviceRepository
}

const defaults: ServiceScheduleRepositories = { items: serviceItemRepository, services: serviceRepository }

async function touchService(serviceId: string, repositories: ServiceScheduleRepositories, updatedAt = new Date().toISOString()) {
  const service = await repositories.services.getById(serviceId)
  if (service) await repositories.services.update({ ...service, updatedAt })
}

/** RN-06: a ordem de um serviço final não muda. */
async function editableError(serviceId: string, repositories: ServiceScheduleRepositories): Promise<string | null> {
  const service = await repositories.services.getById(serviceId)
  if (!service) return 'Serviço não encontrado.'
  return isFinalStatus(service.status) ? 'Serviço encerrado não pode ser editado.' : null
}

// Os itens renumerados sobem juntos no mesmo lote do sync (unique deferida no banco, VS-02 §Dados).
async function saveRenumbered(serviceId: string, changed: ServiceItem[], repositories: ServiceScheduleRepositories) {
  const now = new Date().toISOString()
  for (const item of changed) await repositories.items.update({ ...item, updatedAt: now })
  await touchService(serviceId, repositories, now)
  return repositories.items.listByServiceId(serviceId)
}

/** Ordem do serviço, do Dexie (offline). */
export function listServiceItems(serviceId: string, repository = serviceItemRepository): Promise<ServiceItem[]> {
  return repository.listByServiceId(serviceId)
}

export async function addServiceItem(
  serviceId: string,
  input: ServiceItemInput & { repertoireId?: string },
  repositories = defaults,
  id = crypto.randomUUID(),
): Promise<ServiceItemsResult> {
  const blocked = await editableError(serviceId, repositories)
  if (blocked) return { success: false, errors: [blocked] }
  const errors = validateServiceItem(input)
  if (errors.length) return { success: false, errors }
  const items = await repositories.items.listByServiceId(serviceId)
  const song = input.type === 'song'
  const item: ServiceItem = {
    id, serviceId, type: input.type, position: items.length, updatedAt: new Date().toISOString(),
    songId: song ? input.songId : undefined,
    title: song ? undefined : input.title?.trim(),
    notes: input.notes?.trim() || undefined,
    durationMinutes: input.durationMinutes,
    repertoireId: input.repertoireId,
  }
  await repositories.items.create(item)
  await touchService(serviceId, repositories, item.updatedAt)
  return { success: true, items: [...items, item] }
}

/** Move para `toIndex` (0 = topo) e renumera, qualquer que seja o tipo (RN-05). */
export async function moveServiceItem(serviceId: string, itemId: string, toIndex: number, repositories = defaults): Promise<ServiceItemsResult> {
  const blocked = await editableError(serviceId, repositories)
  if (blocked) return { success: false, errors: [blocked] }
  const items = await repositories.items.listByServiceId(serviceId)
  if (!items.some((item) => item.id === itemId)) return { success: false, errors: ['Item não encontrado.'] }
  return { success: true, items: await saveRenumbered(serviceId, moveItem(items, itemId, toIndex), repositories) }
}

export async function removeServiceItem(serviceItemId: string, repositories = defaults): Promise<ServiceItemsResult> {
  const item = await repositories.items.getById(serviceItemId)
  if (!item) return { success: false, errors: ['Item não encontrado.'] }
  const blocked = await editableError(item.serviceId, repositories)
  if (blocked) return { success: false, errors: [blocked] }
  await repositories.items.remove(serviceItemId)
  const remaining = await repositories.items.listByServiceId(item.serviceId)
  return { success: true, items: await saveRenumbered(item.serviceId, renumber(remaining), repositories) }
}
