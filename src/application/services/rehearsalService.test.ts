import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/database'
import { rehearsalRepository } from '../../db/repositories/rehearsalRepository'
import { serviceItemRepository } from '../../db/repositories/serviceItemRepository'
import { serviceRepository } from '../../db/repositories/serviceRepository'
import { songRepository } from '../../db/repositories/songRepository'
import type { AccessContext } from '../../domain/access/permissions'
import { createRehearsal, deleteRehearsal, listRehearsals, updateRehearsal, type RehearsalRepositories } from './rehearsalService'

const sync = vi.hoisted(() => ({
  queueTargetUpsert: vi.fn(),
  queueTargetUpserts: vi.fn(async (_e: string, _p: unknown, _t: unknown, write: () => Promise<void>) => write()),
  queueTargetDeleteAtomic: vi.fn(async (_e: string, _i: string, _t: unknown, write: () => Promise<void>) => write()),
}))
vi.mock('../../sync/syncService', () => sync)

const now = '2026-10-01T12:00:00Z'
const service = { id: 's1', organizationId: 'org-1', teamId: 't1', name: 'Culto', startsAt: now, status: 'draft' as const, createdByUserId: 'u1', createdAt: now, updatedAt: now }
const leader = { organizationRole: 'member', teamRole: 'leader', teamStatus: 'active' } as AccessContext
const member = { organizationRole: 'member', teamRole: 'member', teamStatus: 'active' } as AccessContext
const repos = (access: AccessContext): RehearsalRepositories => ({ rehearsals: rehearsalRepository, services: serviceRepository, items: serviceItemRepository, songs: songRepository, access: async () => access })
const input = { startsAt: '2026-10-03T19:00:00Z', location: ' Sala 2 ', serviceItemIds: ['i2', 'i1'] }

describe('rehearsals (RN-19…21)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await Promise.all([db.services.clear(), db.serviceItems.clear(), db.songs.clear(), db.rehearsals.clear(), db.rehearsalSongs.clear()])
    await db.services.put(service)
    await db.songs.bulkPut([
      { id: 'a', title: 'Grande', originalKey: 'G', currentKey: 'G', lyrics: '', isFavorite: false, createdAt: now, updatedAt: now },
      { id: 'b', title: 'Outra', originalKey: 'C', currentKey: 'C', lyrics: '', isFavorite: false, createdAt: now, updatedAt: now },
    ])
    await db.serviceItems.bulkPut([
      { id: 'i1', serviceId: 's1', type: 'song', songId: 'a', position: 0, updatedAt: now },
      { id: 'i2', serviceId: 's1', type: 'song', songId: 'b', position: 1, updatedAt: now },
      { id: 'i3', serviceId: 's1', type: 'other', title: 'Pausa', position: 2, updatedAt: now },
    ])
  })

  it('creates, lists (ordered, songs in service order), updates and deletes offline', async () => {
    const created = await createRehearsal('s1', input, repos(leader))
    expect(created.success && created.rehearsal).toMatchObject({ location: 'Sala 2', songs: [{ serviceItemId: 'i1', position: 1 }, { serviceItemId: 'i2', position: 2 }] })
    if (!created.success) return
    expect(await createRehearsal('s1', { ...input, startsAt: '2026-10-02T19:00:00Z', serviceItemIds: [] }, repos(leader))).toMatchObject({ success: true })
    const listed = await listRehearsals('s1', repos(member))
    expect(listed).toMatchObject({ success: true, canManage: false })
    expect(listed.success && listed.rehearsals.map((r) => r.startsAt.slice(0, 10))).toEqual(['2026-10-02', '2026-10-03'])
    const updated = await updateRehearsal(created.rehearsal.id, { ...input, serviceItemIds: ['i2'] }, repos(leader))
    expect(updated.success && updated.rehearsal.songs.map((s) => s.serviceItemId)).toEqual(['i2'])
    expect(sync.queueTargetUpserts).toHaveBeenLastCalledWith('rehearsals', expect.anything(), expect.anything(), expect.anything(), { deleteSongIds: [`${created.rehearsal.id}:i1`], upsertSongs: [] })
    expect(await deleteRehearsal(created.rehearsal.id, repos(leader))).toEqual({ success: true })
    expect(await db.rehearsalSongs.where('rehearsalId').equals(created.rehearsal.id).count()).toBe(0)
  })

  it('rejects members, final services, non-song items, repeats and bad input', async () => {
    expect(await createRehearsal('s1', input, repos(member))).toMatchObject({ success: false })
    expect(await createRehearsal('s1', { ...input, serviceItemIds: ['i3'] }, repos(leader))).toMatchObject({ success: false })
    expect(await createRehearsal('s1', { ...input, serviceItemIds: ['i1', 'i1'] }, repos(leader))).toMatchObject({ success: false })
    expect(await createRehearsal('s1', { ...input, location: 'x'.repeat(121) }, repos(leader))).toMatchObject({ success: false })
    expect(await createRehearsal('s1', { ...input, startsAt: 'nope' }, repos(leader))).toMatchObject({ success: false })
    const ok = await createRehearsal('s1', input, repos(leader))
    if (!ok.success) throw new Error('setup')
    expect(await deleteRehearsal(ok.rehearsal.id, repos(member))).toMatchObject({ success: false })
    await db.services.update('s1', { status: 'completed' })
    expect(await createRehearsal('s1', input, repos(leader))).toMatchObject({ success: false })
    expect(await updateRehearsal(ok.rehearsal.id, input, repos(leader))).toMatchObject({ success: false })
    expect(await deleteRehearsal(ok.rehearsal.id, repos(leader))).toMatchObject({ success: false })
    expect(await rehearsalRepository.get(ok.rehearsal.id)).toBeDefined()
  })

  it('removing a service item drops its focus rows locally', async () => {
    const ok = await createRehearsal('s1', input, repos(leader))
    if (!ok.success) throw new Error('setup')
    await serviceItemRepository.remove('i1')
    expect((await db.rehearsalSongs.toArray()).map((s) => s.serviceItemId)).toEqual(['i2'])
  })
})
