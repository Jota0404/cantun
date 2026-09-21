import { describe, expect, it, vi } from 'vitest'
import type { ServiceItem } from '../../domain/services/serviceItem'

describe('serviceScheduleService', () => {
  it('adds songs after the current service order', async () => {
    vi.resetModules()
    const items: ServiceItem[] = [
      { id: 'i1', serviceId: 's1', songId: 'song1', position: 0, updatedAt: 'old' },
    ]
    const service = { id: 's1', organizationId: 'o1', name: 'Culto', startsAt: '2026-09-21T12:00:00Z', status: 'planned' as const, createdByUserId: 'u1', createdAt: 'old', updatedAt: 'old' }
    const itemRepository = {
      listByServiceId: vi.fn(async () => [...items]),
      create: vi.fn(async (value: ServiceItem) => items.push(value)),
      getById: vi.fn(),
      remove: vi.fn(),
      update: vi.fn(),
    }
    const serviceRepository = {
      getById: vi.fn(async () => service),
      update: vi.fn(),
    }
    vi.doMock('../../db/repositories/serviceItemRepository', () => ({ serviceItemRepository: itemRepository }))
    vi.doMock('../../db/repositories/serviceRepository', () => ({ serviceRepository }))
    const { addSongToService } = await import('./serviceScheduleService')

    const created = await addSongToService('s1', 'song2', undefined, 'i2')

    expect(created.position).toBe(1)
    expect(itemRepository.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'i2', position: 1 }))
    expect(serviceRepository.update).toHaveBeenCalled()
  })

  it('rejects reorder payloads that do not contain the exact service items', async () => {
    vi.resetModules()
    const items: ServiceItem[] = [
      { id: 'i1', serviceId: 's1', songId: 'song1', position: 0, updatedAt: 'old' },
      { id: 'i2', serviceId: 's1', songId: 'song2', position: 1, updatedAt: 'old' },
    ]
    const itemRepository = { listByServiceId: vi.fn(async () => items), update: vi.fn() }
    const serviceRepository = { getById: vi.fn(), update: vi.fn() }
    vi.doMock('../../db/repositories/serviceItemRepository', () => ({ serviceItemRepository: itemRepository }))
    vi.doMock('../../db/repositories/serviceRepository', () => ({ serviceRepository }))
    const { reorderService } = await import('./serviceScheduleService')

    await expect(reorderService('s1', ['i1'])).rejects.toThrow('exatamente os itens atuais')
    expect(itemRepository.update).not.toHaveBeenCalled()
  })
})
