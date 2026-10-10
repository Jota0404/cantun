import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../platform/rpc', () => ({ rpc }))
vi.mock('../../platform/auth', () => ({ getCurrentUser: () => ({ id: 'u1', email: 'u@example.com', emailVerified: true, displayName: 'U' }) }))

import { db } from '../../db/database'
import type { Service } from '../../domain/services/service'
import { addServiceItem, moveServiceItem, removeServiceItem } from './serviceScheduleService'
import { createService, listServices, transitionService, updateServiceInfo } from './serviceService'

const now = '2026-10-01T00:00:00.000Z'
const base: Service = { id: 's1', organizationId: 'o1', teamId: 't1', name: 'Culto', startsAt: now, status: 'draft', createdByUserId: 'u1', createdAt: now, updatedAt: now }

describe('service use cases', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    await Promise.all([db.services.clear(), db.serviceItems.clear()])
    await db.services.put(base)
  })

  it('creates a draft service with team and validates input', async () => {
    const result = await createService({ organizationId: 'o1', teamId: 't1', name: ' Ceia ', startsAt: now, location: ' ' }, undefined, '00000000-0000-4000-8000-000000000001')
    expect(result).toMatchObject({ success: true, service: { status: 'draft', teamId: 't1', name: 'Ceia', createdByUserId: 'u1', location: undefined } })
    await expect(createService({ organizationId: 'o1', teamId: '', name: '', startsAt: 'x' })).resolves.toEqual({
      success: false, errors: ['Informe o nome do serviço.', 'Informe data e hora válidas.', 'Escolha a equipe do serviço.'],
    })
  })

  it('adds mixed items, moves them and renumbers on removal', async () => {
    await addServiceItem('s1', { type: 'opening', title: 'Abertura' }, undefined, '00000000-0000-4000-8000-00000000000a')
    await addServiceItem('s1', { type: 'song', songId: 'song-1' }, undefined, '00000000-0000-4000-8000-00000000000b')
    await addServiceItem('s1', { type: 'prayer', title: 'Oração' }, undefined, '00000000-0000-4000-8000-00000000000c')
    const invalid = await addServiceItem('s1', { type: 'song' })
    expect(invalid).toEqual({ success: false, errors: ['Escolha a música.'] })

    const moved = await moveServiceItem('s1', '00000000-0000-4000-8000-00000000000c', 0)
    expect(moved.success && moved.items.map((i) => [i.type, i.position])).toEqual([['prayer', 0], ['opening', 1], ['song', 2]])

    const removed = await removeServiceItem('00000000-0000-4000-8000-00000000000a')
    expect(removed.success && removed.items.map((i) => [i.type, i.position])).toEqual([['prayer', 0], ['song', 1]])
  })

  it('blocks edits on final services (RN-06)', async () => {
    await db.services.put({ ...base, status: 'completed' })
    await expect(updateServiceInfo('s1', { name: 'Novo' })).resolves.toEqual({ success: false, errors: ['Serviço encerrado não pode ser editado.'] })
    await expect(addServiceItem('s1', { type: 'other', title: 'x' })).resolves.toMatchObject({ success: false })
    await expect(moveServiceItem('s1', 'any', 0)).resolves.toMatchObject({ success: false })
  })

  it('transitions only through the RPC and keeps local state when refused', async () => {
    await expect(transitionService('s1', 'completed')).resolves.toEqual({ success: false, errors: ['Mudança de estado não permitida.'] })
    expect(rpc).not.toHaveBeenCalled()

    rpc.mockRejectedValueOnce(new Error('Você não tem permissão para esta ação.'))
    await expect(transitionService('s1', 'ready')).resolves.toMatchObject({ success: false })
    expect((await db.services.get('s1'))?.status).toBe('draft')

    rpc.mockResolvedValueOnce({ id: 's1', status: 'ready', updated_at: '2026-10-02T00:00:00.000Z' })
    await expect(transitionService('s1', 'ready')).resolves.toMatchObject({ success: true, service: { status: 'ready' } })
    expect(rpc).toHaveBeenLastCalledWith('transition_service', { p_service_id: 's1', p_to: 'ready' })
    expect((await db.services.get('s1'))?.status).toBe('ready')
  })

  it('groups services into upcoming, planning and past', async () => {
    await db.services.bulkPut([
      { ...base, id: 'a', status: 'ready', startsAt: '2026-10-05T00:00:00Z' },
      { ...base, id: 'b', status: 'in_progress', startsAt: '2026-10-03T00:00:00Z' },
      { ...base, id: 'c', status: 'completed', startsAt: '2026-09-01T00:00:00Z' },
      { ...base, id: 'd', status: 'cancelled', startsAt: '2026-09-10T00:00:00Z' },
    ])
    const groups = await listServices('o1')
    expect(groups.upcoming.map((s) => s.id)).toEqual(['b', 'a'])
    expect(groups.planning.map((s) => s.id)).toEqual(['s1'])
    expect(groups.past.map((s) => s.id)).toEqual(['d', 'c'])
  })
})
