import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/database'
import { songRepository } from '../../db/repositories/songRepository'
import { serviceItemRepository } from '../../db/repositories/serviceItemRepository'
import { serviceRepository } from '../../db/repositories/serviceRepository'
import type { AccessContext } from '../../domain/access/permissions'
import { queueTargetDelete } from '../../sync/syncService'
import { addReprise, type AddRepriseRepositories } from './addReprise'
import { removeServiceItem } from './serviceScheduleService'

vi.mock('../../sync/syncService', () => ({ queueTargetUpsert: vi.fn(), queueTargetUpserts: vi.fn(async (_e: string, _v: unknown, _t: unknown, write: () => Promise<void>) => write()), queueTargetDelete: vi.fn() }))

const now = '2026-10-01T12:00:00Z'
const service = { id: 's1', organizationId: 'org-1', teamId: 't1', name: 'Culto', startsAt: now, status: 'draft' as const, createdByUserId: 'u1', createdAt: now, updatedAt: now }
const allowed = { organizationRole: 'owner' } as unknown as AccessContext
const repositories = (access: AccessContext = allowed): AddRepriseRepositories => ({ items: serviceItemRepository, songs: songRepository, services: serviceRepository, access: async () => access })

describe('addReprise (RN-10, RN-11)', () => {
  beforeEach(async () => {
    await Promise.all([db.services.clear(), db.serviceItems.clear(), db.songs.clear()])
    await db.services.put(service)
    await db.songs.put({ id: 'a', title: 'Grande é o Senhor', originalKey: 'G', currentKey: 'G', lyrics: '', isFavorite: false, createdAt: now, updatedAt: now })
    await db.serviceItems.bulkPut([
      { id: 'i1', serviceId: 's1', type: 'song', songId: 'a', position: 0, updatedAt: now },
      { id: 'i2', serviceId: 's1', type: 'prayer', title: 'Oração', position: 1, updatedAt: now },
    ])
  })

  it('creates a reprise with the auto title at the end of the order', async () => {
    const result = await addReprise('s1', { type: 'reprise', refItemId: 'i1' }, repositories())
    expect(result).toMatchObject({ success: true, item: { type: 'reprise', title: 'Reprise: Grande é o Senhor', refItemId: 'i1', position: 2 } })
    expect(result.success && (await db.serviceItems.get(result.item.id))?.songId).toBeUndefined()
  })

  it('refuses a non-song target, a missing target and an ended service', async () => {
    expect(await addReprise('s1', { type: 'medley', refItemId: 'i2' }, repositories())).toMatchObject({ success: false })
    expect(await addReprise('s1', { type: 'medley', refItemId: 'nope' }, repositories())).toMatchObject({ success: false })
    await db.services.put({ ...service, status: 'completed' })
    expect(await addReprise('s1', { type: 'reprise', refItemId: 'i1' }, repositories())).toMatchObject({ success: false })
  })

  it('refuses without service.edit', async () => {
    const result = await addReprise('s1', { type: 'reprise', refItemId: 'i1' }, repositories({} as AccessContext))
    expect(result).toMatchObject({ success: false })
    expect(await db.serviceItems.count()).toBe(2)
  })

  it('removing the target removes its reprises and renumbers', async () => {
    const added = await addReprise('s1', { type: 'reprise', refItemId: 'i1' }, repositories())
    vi.mocked(queueTargetDelete).mockClear()
    const result = await removeServiceItem('i1')
    expect(result).toMatchObject({ success: true })
    // Reprises primeiro, depois o alvo (RN-11): a fila nunca apaga o alvo com reprise viva.
    expect(vi.mocked(queueTargetDelete).mock.calls.map(([, id]) => id)).toEqual([added.success ? added.item.id : '', 'i1'])
    expect((await db.serviceItems.toArray()).map((i) => [i.id, i.position])).toEqual([['i2', 0]])
  })
})
