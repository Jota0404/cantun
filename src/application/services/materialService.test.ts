import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/database'
import { materialRepository } from '../../db/repositories/materialRepository'
import { rehearsalRepository } from '../../db/repositories/rehearsalRepository'
import { serviceRepository } from '../../db/repositories/serviceRepository'
import { songRepository } from '../../db/repositories/songRepository'
import type { AccessContext } from '../../domain/access/permissions'
import { addMaterial, deleteMaterial, listMaterials, updateMaterial, type MaterialRepositories } from './materialService'

const sync = vi.hoisted(() => ({
  queueTargetUpsert: vi.fn(), queueLocalUpsert: vi.fn(), queueLocalDelete: vi.fn(),
  queueTargetUpserts: vi.fn(async (_e: string, _p: unknown, _t: unknown, write: () => Promise<void>) => write()),
  queueTargetDeleteAtomic: vi.fn(async (_e: string, _i: string, _t: unknown, write: () => Promise<void>) => write()),
}))
vi.mock('../../sync/syncService', () => sync)

const now = '2026-10-01T12:00:00Z'
const service = { id: 's1', organizationId: 'org-1', teamId: 't1', name: 'Culto', startsAt: now, status: 'draft' as const, createdByUserId: 'u1', createdAt: now, updatedAt: now }
const song = { title: 'Grande', originalKey: 'G' as const, currentKey: 'G' as const, lyrics: '', isFavorite: false, createdAt: now, updatedAt: now }
const leader = { organizationRole: 'member', teamRole: 'leader', teamStatus: 'active', isActiveLeaderInOrganization: true } as AccessContext
const member = { organizationRole: 'member', teamRole: 'member', teamStatus: 'active' } as AccessContext
const repos = (access: AccessContext): MaterialRepositories => ({ materials: materialRepository, services: serviceRepository, rehearsals: rehearsalRepository, songs: songRepository, access: async () => access, currentUserId: () => 'u1' })
const input = { title: ' Cifra ', url: 'https://www.cifraclub.com.br/x', notes: ' tom G ' }

describe('materials (RN-22…25)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await Promise.all([db.services.clear(), db.songs.clear(), db.rehearsals.clear(), db.materials.clear(), db.targetSyncQueue.clear()])
    await db.services.put(service)
    await db.rehearsals.put({ id: 'r1', organizationId: 'org-1', serviceId: 's1', startsAt: now, createdAt: now, updatedAt: now })
    await db.songs.bulkPut([{ ...song, id: 'g1', organizationId: 'org-1' }, { ...song, id: 'mine' }])
  })

  it('leader adds, lists, updates and deletes a service material', async () => {
    const added = await addMaterial({ type: 'service', id: 's1' }, input, repos(leader))
    expect(added).toMatchObject({ success: true, material: { ownerType: 'service', ownerId: 's1', title: 'Cifra', domain: 'cifraclub.com.br', notes: 'tom G' } })
    if (!added.success) return
    expect(await listMaterials({ type: 'service', id: 's1' }, repos(leader))).toMatchObject({ success: true, canManage: true, materials: [{ id: added.material.id }] })
    expect(await updateMaterial(added.material.id, { title: 'Nova', url: 'https://x.com' }, repos(leader))).toMatchObject({ success: true, material: { title: 'Nova' } })
    expect(await deleteMaterial(added.material.id, repos(leader))).toEqual({ success: true })
    expect(await db.materials.count()).toBe(0)
  })

  it('regular member reads but cannot write', async () => {
    await db.materials.put({ id: 'm1', organizationId: 'org-1', serviceId: 's1', kind: 'link', title: 'x', url: 'https://x.com', createdAt: now, updatedAt: now })
    expect(await listMaterials({ type: 'service', id: 's1' }, repos(member))).toMatchObject({ success: true, canManage: false })
    expect((await addMaterial({ type: 'service', id: 's1' }, input, repos(member))).success).toBe(false)
    expect((await updateMaterial('m1', input, repos(member))).success).toBe(false)
    expect((await deleteMaterial('m1', repos(member))).success).toBe(false)
  })

  it('refuses writes on completed services', async () => {
    await db.services.put({ ...service, status: 'completed' })
    expect(await addMaterial({ type: 'rehearsal', id: 'r1' }, input, repos(leader))).toEqual({ success: false, errors: ['Serviço encerrado não aceita alteração.'] })
    expect(await listMaterials({ type: 'service', id: 's1' }, repos(leader))).toMatchObject({ canManage: false })
  })

  it('refuses invalid input and unknown or personal owners', async () => {
    expect((await addMaterial({ type: 'service', id: 's1' }, { title: 'x', url: 'http://x.com' }, repos(leader))).success).toBe(false)
    expect((await addMaterial({ type: 'service', id: 'nope' }, input, repos(leader))).success).toBe(false)
    const personal = await addMaterial({ type: 'song', id: 'mine' }, input, repos(leader))
    expect(personal).toMatchObject({ success: false, errors: [expect.stringContaining('pessoais')] })
  })

  it('song owner needs song.edit', async () => {
    expect((await addMaterial({ type: 'song', id: 'g1' }, input, repos(leader))).success).toBe(true)
    expect((await addMaterial({ type: 'song', id: 'g1' }, input, repos(member))).success).toBe(false)
  })

  it('local cascade removes owner materials and their pending queue', async () => {
    const base = { organizationId: 'org-1', kind: 'link' as const, title: 'x', url: 'https://x.com', createdAt: now, updatedAt: now }
    await db.materials.bulkPut([{ ...base, id: 'a', serviceId: 's1' }, { ...base, id: 'b', rehearsalId: 'r1' }, { ...base, id: 'c', songId: 'g1' }, { ...base, id: 'd', songId: 'keep' }])
    await db.targetSyncQueue.add({ entity: 'materials', entityId: 'b', operation: 'upsert', updatedAt: now, attempts: 0 })
    await rehearsalRepository.remove('r1')
    expect(await db.materials.get('b')).toBeUndefined()
    expect(await db.targetSyncQueue.count()).toBe(0)
    await serviceRepository.remove('s1')
    expect(await db.materials.get('a')).toBeUndefined()
    await songRepository.remove('g1')
    expect((await db.materials.toArray()).map((m) => m.id)).toEqual(['d'])
  })
})
