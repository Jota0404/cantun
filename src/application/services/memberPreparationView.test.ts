import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/database'
import { assignmentRepository } from '../../db/repositories/assignmentRepository'
import { serviceItemRepository } from '../../db/repositories/serviceItemRepository'
import { serviceRepository } from '../../db/repositories/serviceRepository'
import { servicePreparationRepository } from '../../db/repositories/servicePreparationRepository'
import { songRepository } from '../../db/repositories/songRepository'
import type { AccessContext } from '../../domain/access/permissions'
import { getMemberPreparationView, type MemberPreparationRepositories } from './memberPreparationView'

import { materialRepository } from '../../db/repositories/materialRepository'
import { defaultRehearsalRepositories } from './rehearsalService'
vi.mock('../../sync/syncService', () => ({ queueTargetUpsert: vi.fn(), queueTargetUpserts: vi.fn(async (_e: string, _p: unknown, _t: unknown, write: () => Promise<void>) => write()), queueTargetDelete: vi.fn(), queueTargetDeleteAtomic: vi.fn() }))

const now = '2026-10-01T12:00:00Z'
const service = { id: 's1', organizationId: 'org-1', teamId: 't1', name: 'Culto', startsAt: now, notes: 'Chegar cedo', status: 'draft' as const, createdByUserId: 'u1', createdAt: now, updatedAt: now }
const repos = (access: AccessContext = { organizationRole: 'member' } as AccessContext): MemberPreparationRepositories => ({
  services: serviceRepository, items: serviceItemRepository, songs: songRepository, assignments: assignmentRepository, preparations: servicePreparationRepository, access: async () => access, currentUserId: () => 'me', rehearsals: defaultRehearsalRepositories, materials: materialRepository,
})
const assignment = (status: 'invited' | 'declined', userId = 'me') => ({ id: `a-${status}-${userId}`, serviceId: 's1', positionId: 'p1', userId, musicalFunction: 'Vocal', status, createdAt: now, updatedAt: now })

describe('getMemberPreparationView (RN-12…14)', () => {
  beforeEach(async () => {
    await Promise.all([db.services.clear(), db.serviceItems.clear(), db.songs.clear(), db.assignments.clear(), db.materials.clear(), db.rehearsals.clear()])
    await db.services.put(service)
    await db.songs.bulkPut([
      { id: 'a', title: 'Grande', artist: 'Ana', bpm: 72, originalKey: 'G', currentKey: 'A', lyrics: '', isFavorite: false, createdAt: now, updatedAt: now },
      { id: 'b', title: 'Outra', originalKey: 'C', currentKey: 'C', lyrics: '', isFavorite: false, createdAt: now, updatedAt: now },
    ])
    await db.serviceItems.bulkPut([
      { id: 'i2', serviceId: 's1', type: 'song', songId: 'b', key: 'D', notes: 'só violão', position: 1, updatedAt: now },
      { id: 'i1', serviceId: 's1', type: 'song', songId: 'a', position: 0, updatedAt: now },
      { id: 'i3', serviceId: 's1', type: 'reprise', title: 'Reprise: Grande', refItemId: 'i1', position: 2, updatedAt: now },
    ])
  })

  it('shows my function, ordered items, effective keys and notes', async () => {
    await db.assignments.bulkPut([assignment('invited'), assignment('invited', 'other')])
    const result = await getMemberPreparationView('s1', repos())
    expect(result).toMatchObject({ success: true, view: { serviceName: 'Culto', myFunction: 'Vocal', serviceNotes: 'Chegar cedo', rehearsals: [], materials: [] } })
    if (!result.success) return
    expect(result.view.items.map((i) => i.id)).toEqual(['i1', 'i2', 'i3'])
    expect(result.view.items[0]).toMatchObject({ title: 'Grande', artist: 'Ana', bpm: 72, effectiveKey: 'A' })
    expect(result.view.items[1]).toMatchObject({ effectiveKey: 'D', notes: 'só violão' })
    expect(result.view.items[2]).toMatchObject({ type: 'reprise', title: 'Reprise: Grande', effectiveKey: undefined })
  })

  it('lists materials of the service, rehearsals and ordered songs', async () => {
    const m = (id: string, owner: object) => ({ id, organizationId: 'org-1', kind: 'link' as const, title: id, url: 'https://www.exemplo.com/x', createdAt: now, updatedAt: now, ...owner })
    await db.rehearsals.put({ id: 'r1', organizationId: 'org-1', serviceId: 's1', startsAt: now, createdAt: now, updatedAt: now })
    await db.materials.bulkPut([m('ms', { serviceId: 's1' }), m('mr', { rehearsalId: 'r1' }), m('mg', { songId: 'a' }), m('other', { songId: 'zzz' })])
    const result = await getMemberPreparationView('s1', repos())
    if (!result.success) throw new Error('fail')
    expect(result.view.materials.map((x) => [x.id, x.ownerType, x.ownerId, x.domain])).toEqual([['ms', 'service', 's1', 'exemplo.com'], ['mr', 'rehearsal', 'r1', 'exemplo.com'], ['mg', 'song', 'a', 'exemplo.com']])
  })

  it('returns null function without an active assignment', async () => {
    await db.assignments.put(assignment('declined'))
    const result = await getMemberPreparationView('s1', repos())
    expect(result.success && result.view.myFunction).toBeNull()
  })

  it('fails for a missing service and for non-members', async () => {
    expect(await getMemberPreparationView('nope', repos())).toMatchObject({ success: false })
    expect(await getMemberPreparationView('s1', repos({ organizationRole: null } as AccessContext))).toMatchObject({ success: false })
    expect(await getMemberPreparationView('s1', repos({ organizationRole: 'member', isActiveInOrganization: false } as AccessContext))).toMatchObject({ success: false })
  })

  it('exposes refPosition and a fallback title for songs missing offline', async () => {
    await db.serviceItems.bulkPut([
      { id: 'i4', serviceId: 's1', type: 'song', songId: 'missing', position: 3, updatedAt: now },
      { id: 'i5', serviceId: 's1', type: 'reprise', refItemId: 'i2', position: 4, updatedAt: now },
    ])
    const result = await getMemberPreparationView('s1', repos())
    if (!result.success) throw new Error('expected success')
    const byId = (id: string) => result.view.items.find((i) => i.id === id)
    expect(byId('i5')?.refPosition).toBe(2)
    expect(byId('i3')?.refPosition).toBe(1)
    expect(byId('i4')?.title).toBe('Música indisponível offline')
  })

  it('exposes my own prepared state', async () => {
    const before = await getMemberPreparationView('s1', repos())
    expect(before.success && before.view.prepared).toBe(false)
    await db.servicePreparations.bulkPut([{ id: 's1:me', serviceId: 's1', userId: 'me', preparedAt: now, updatedAt: now }])
    const after = await getMemberPreparationView('s1', repos())
    expect(after.success && after.view.prepared).toBe(true)
    await db.servicePreparations.clear()
  })

  it('includes the service rehearsals with their focus songs in service order', async () => {
    await db.rehearsals.clear(); await db.rehearsalSongs.clear()
    await db.rehearsals.put({ id: 'r1', organizationId: 'org-1', serviceId: 's1', startsAt: now, location: 'Sala 2', createdAt: now, updatedAt: now })
    await db.rehearsalSongs.bulkPut([{ rehearsalId: 'r1', serviceItemId: 'i2' }, { rehearsalId: 'r1', serviceItemId: 'i1' }])
    const result = await getMemberPreparationView('s1', repos())
    expect(result.success && result.view.rehearsals).toEqual([
      { id: 'r1', serviceId: 's1', startsAt: now, location: 'Sala 2', notes: undefined, songs: [{ serviceItemId: 'i1', title: 'Grande', position: 1 }, { serviceItemId: 'i2', title: 'Outra', position: 2 }] },
    ])
  })
})
