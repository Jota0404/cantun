import type { ServiceItem } from '../../domain/services/serviceItem'
import { serviceItemRepository } from '../../db/repositories/serviceItemRepository'
import { serviceRepository } from '../../db/repositories/serviceRepository'

export async function addSongToService(serviceId: string, songId: string, repertoireId?: string, id = crypto.randomUUID()): Promise<ServiceItem> {
  const items = await serviceItemRepository.listByServiceId(serviceId)
  const value: ServiceItem = { id, serviceId, songId, position: items.length, repertoireId, updatedAt: new Date().toISOString() }
  await serviceItemRepository.create(value)
  const service = await serviceRepository.getById(serviceId)
  if (service) await serviceRepository.update({ ...service, updatedAt: value.updatedAt })
  return value
}
