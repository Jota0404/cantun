import type { Service } from '../../domain/services/service'
import type { ServiceItem } from '../../domain/services/serviceItem'
import { serviceItemRepository } from '../../db/repositories/serviceItemRepository'
import { serviceRepository } from '../../db/repositories/serviceRepository'

async function touchService(serviceId: string, updatedAt = new Date().toISOString()) {
  const service = await serviceRepository.getById(serviceId)
  if (service) await serviceRepository.update({ ...service, updatedAt })
}

export async function addSongToService(
  serviceId: string,
  songId: string,
  repertoireId?: string,
  id = crypto.randomUUID(),
): Promise<ServiceItem> {
  const items = await serviceItemRepository.listByServiceId(serviceId)
  const value: ServiceItem = {
    id,
    serviceId,
    songId,
    position: items.length,
    repertoireId,
    updatedAt: new Date().toISOString(),
  }
  await serviceItemRepository.create(value)
  await touchService(serviceId, value.updatedAt)
  return value
}

export async function removeServiceItem(serviceItemId: string): Promise<void> {
  const item = await serviceItemRepository.getById(serviceItemId)
  if (!item) return

  await serviceItemRepository.remove(serviceItemId)
  const remaining = await serviceItemRepository.listByServiceId(item.serviceId)

  for (let index = 0; index < remaining.length; index += 1) {
    const current = remaining[index]
    if (current.position !== index) {
      await serviceItemRepository.update({
        ...current,
        position: index,
        updatedAt: new Date().toISOString(),
      })
    }
  }

  await touchService(item.serviceId)
}

export async function reorderService(
  serviceId: string,
  orderedItemIds: string[],
): Promise<ServiceItem[]> {
  const items = await serviceItemRepository.listByServiceId(serviceId)
  const expected = new Set(items.map((item) => item.id))
  const received = new Set(orderedItemIds)

  if (
    expected.size !== received.size ||
    orderedItemIds.length !== received.size ||
    [...expected].some((id) => !received.has(id))
  ) {
    throw new Error('A nova ordem deve conter exatamente os itens atuais do serviço.')
  }

  const now = new Date().toISOString()
  const updated = items.map((item) => ({
    ...item,
    position: orderedItemIds.indexOf(item.id),
    updatedAt: now,
  }))

  for (const item of updated) await serviceItemRepository.update(item)
  await touchService(serviceId, now)

  return updated.sort((a, b) => a.position - b.position)
}

export async function updateService(
  serviceId: string,
  patch: Partial<Pick<Service, 'name' | 'startsAt' | 'status'>>,
): Promise<Service> {
  const current = await serviceRepository.getById(serviceId)
  if (!current) throw new Error('Serviço não encontrado.')

  const updated: Service = {
    ...current,
    ...patch,
    name: patch.name?.trim() || current.name,
    updatedAt: new Date().toISOString(),
  }
  await serviceRepository.update(updated)
  return updated
}
