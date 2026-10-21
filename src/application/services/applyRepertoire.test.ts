import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fila real (fake-indexeddb); só o `sync` é desligado.
vi.mock('../../sync/syncService', async () => {
  const { db } = await import('../../db/database')
  const { TargetSyncEngine } = await import('../../sync/targetSyncEngine')
  const engine = new TargetSyncEngine(db)
  engine.sync = async () => {}
  return {
    queueTargetUpsert: engine.queueUpsert.bind(engine), queueTargetDelete: engine.queueDelete.bind(engine), queueTargetUpserts: engine.queueUpserts.bind(engine),
  }
})
vi.mock('../../platform/http', () => ({ isPlatformConfigured: false }))
vi.mock('../../platform/rpc', () => ({ rpc: vi.fn() }))
vi.mock('../../platform/auth', () => ({ getCurrentUser: () => ({ id: 'u1', email: 'u@example.com', emailVerified: true, displayName: 'U' }) }))

import { db } from '../../db/database'
import type { AccessContext } from '../../domain/access/permissions'
import type { Service } from '../../domain/services/service'
import { repertoireItemRepository } from '../../db/repositories/repertoireItemRepository'
import { repertoireRepository } from '../../db/repositories/repertoireRepository'
import { songRepository } from '../../db/repositories/songRepository'
import { serviceItemRepository } from '../../db/repositories/serviceItemRepository'
import { serviceRepository } from '../../db/repositories/serviceRepository'
import { duplicateRepertoire } from '../repertoires/repertoireService'
import { applyRepertoireToService, listApplicableRepertoires, setServiceItemKey } from './applyRepertoire'

const now = '2026-10-01T00:00:00.000Z'
const leader: AccessContext = { organizationRole: 'member', teamRole: 'leader', teamStatus: 'active', isActiveInOrganization: true }
const member: AccessContext = { organizationRole: 'member', teamRole: 'member', teamStatus: 'active', isActiveInOrganization: true }
const repos = (access: AccessContext) => ({ repertoires: repertoireRepository, repertoireItems: repertoireItemRepository, items: serviceItemRepository, songs: songRepository, services: serviceRepository, access: async () => access })
const service: Service = { id: 's1', organizationId: 'o1', teamId: 't1', name: 'Culto', startsAt: now, status: 'draft', createdByUserId: 'u1', createdAt: now, updatedAt: now }
const song = (id: string) => ({ id, title: id, organizationId: 'o1', originalKey: 'G' as const, currentKey: 'G' as const, lyrics: '', isFavorite: false, createdAt: now, updatedAt: now })

describe('applyRepertoireToService', () => {
  beforeEach(async () => {
    await Promise.all([db.services.clear(), db.serviceItems.clear(), db.repertoires.clear(), db.repertoireItems.clear(), db.songs.clear(), db.targetSyncQueue.clear()])
    await db.services.put(service)
    await db.songs.bulkPut(['a', 'b', 'c'].map(song))
    await db.repertoires.bulkPut([
      { id: 'r1', organizationId: 'o1', name: 'Domingo', createdByUserId: 'u1', version: 1, createdAt: now, updatedAt: now },
      { id: 'r2', organizationId: 'o2', name: 'Outro', createdByUserId: 'u1', version: 1, createdAt: now, updatedAt: now },
      { id: 'rp', name: 'Pessoal', createdByUserId: 'u1', version: 1, createdAt: now, updatedAt: now },
    ])
    await db.repertoireItems.bulkPut(['a', 'b', 'c'].map((songId, position) => ({ id: `ri-${songId}`, repertoireId: 'r1', songId, position, updatedAt: now })))
    await db.serviceItems.bulkPut([
      { id: 'i0', serviceId: 's1', type: 'opening', title: 'Abertura', position: 0, updatedAt: now },
      { id: 'i1', serviceId: 's1', type: 'prayer', title: 'Oração', position: 1, updatedAt: now },
    ])
  })

  const order = async () => (await db.serviceItems.where('serviceId').equals('s1').sortBy('position')).map((i) => i.songId ?? i.id)

  it('appends the chosen songs in the chosen order and keeps the repertoire', async () => {
    const result = await applyRepertoireToService('s1', { repertoireId: 'r1', songIds: ['c', 'a'] }, repos(leader))
    expect(result).toMatchObject({ success: true, added: 2 })
    expect(await order()).toEqual(['i0', 'i1', 'c', 'a'])
    expect(await db.repertoireItems.where('repertoireId').equals('r1').count()).toBe(3)
  })

  it('inserts after an item and renumbers the rest in the same sync batch', async () => {
    await applyRepertoireToService('s1', { repertoireId: 'r1', songIds: ['a', 'b'], afterItemId: 'i0' }, repos(leader))
    expect(await order()).toEqual(['i0', 'a', 'b', 'i1'])
    expect((await db.serviceItems.toArray()).map((i) => i.position).sort()).toEqual([0, 1, 2, 3])
    const ids = (await db.targetSyncQueue.toArray()).filter((q) => q.entity === 'serviceItems').map((q) => q.entityId)
    expect(ids).toHaveLength(3)
    expect(ids).toContain('i1')
    expect(ids).not.toContain('i0')
  })

  it('skips songs already in the order and fails when nothing is new', async () => {
    await applyRepertoireToService('s1', { repertoireId: 'r1', songIds: ['a'] }, repos(leader))
    const again = await applyRepertoireToService('s1', { repertoireId: 'r1', songIds: ['a', 'b'] }, repos(leader))
    expect(again).toMatchObject({ success: true, added: 1 })
    expect((await order()).filter((id) => id === 'a')).toHaveLength(1)
    expect(await applyRepertoireToService('s1', { repertoireId: 'r1', songIds: ['a', 'b'] }, repos(leader))).toMatchObject({ success: false })
  })

  it('rejects another organization, personal repertoire, foreign songs, unknown anchor, no permission and final service', async () => {
    for (const repertoireId of ['r2', 'rp']) expect(await applyRepertoireToService('s1', { repertoireId, songIds: [] }, repos(leader))).toMatchObject({ success: false })
    expect(await applyRepertoireToService('s1', { repertoireId: 'r1', songIds: ['zzz'] }, repos(leader))).toMatchObject({ success: false })
    expect(await applyRepertoireToService('s1', { repertoireId: 'r1', songIds: ['a'], afterItemId: 'nope' }, repos(leader))).toMatchObject({ success: false })
    expect(await applyRepertoireToService('s1', { repertoireId: 'r1', songIds: ['a'] }, repos(member))).toMatchObject({ success: false })
    await db.services.put({ ...service, status: 'completed' })
    expect(await applyRepertoireToService('s1', { repertoireId: 'r1', songIds: ['a'] }, repos(leader))).toMatchObject({ success: false, errors: ['Serviço encerrado não pode ser editado.'] })
    expect(await order()).toEqual(['i0', 'i1'])
  })

  it('is atomic: a failure mid-write leaves no duplicate positions and no partial queue', async () => {
    const spy = vi.spyOn(db.serviceItems, 'bulkPut').mockRejectedValueOnce(new Error('boom'))
    await expect(applyRepertoireToService('s1', { repertoireId: 'r1', songIds: ['a'], afterItemId: 'i0' }, repos(leader))).rejects.toThrow('boom')
    spy.mockRestore()
    expect(await order()).toEqual(['i0', 'i1'])
    expect(await db.targetSyncQueue.count()).toBe(0)
  })

  it('rejects songs that are not on this device', async () => {
    await db.songs.delete('a')
    expect(await applyRepertoireToService('s1', { repertoireId: 'r1', songIds: ['a'] }, repos(leader))).toMatchObject({ success: false })
  })

  it('works offline and queues every change; lists only same-organization repertoires', async () => {
    await applyRepertoireToService('s1', { repertoireId: 'r1', songIds: ['a'], afterItemId: 'i0' }, repos(leader))
    expect((await db.targetSyncQueue.toArray()).filter((q) => q.entity === 'serviceItems')).toHaveLength(2)
    expect((await listApplicableRepertoires('s1')).map((r) => r.id)).toEqual(['r1'])
  })
})

describe('duplicateRepertoire', () => {
  beforeEach(async () => {
    await Promise.all([db.repertoires.clear(), db.repertoireItems.clear(), db.organizations.clear(), db.organizationMemberships.clear()])
    await db.repertoires.bulkPut([
      { id: 'r1', organizationId: 'o1', name: 'Domingo', createdByUserId: 'other', version: 3, createdAt: now, updatedAt: now },
      { id: 'rp', name: 'Pessoal', createdByUserId: 'u1', version: 1, createdAt: now, updatedAt: now },
    ])
    await db.repertoireItems.bulkPut([{ id: 'x1', repertoireId: 'rp', songId: 'a', position: 0, updatedAt: now }, { id: 'x2', repertoireId: 'rp', songId: 'b', position: 1, updatedAt: now }])
  })

  it('copies a personal repertoire as "Cópia de …" with the same order, authored by the user', async () => {
    const copy = await duplicateRepertoire('rp')
    expect(copy).toMatchObject({ name: 'Cópia de Pessoal', createdByUserId: 'u1', version: 1 })
    expect(copy.organizationId).toBeUndefined()
    expect((await db.repertoireItems.where('repertoireId').equals(copy.id).sortBy('position')).map((i) => i.songId)).toEqual(['a', 'b'])
    expect(await db.repertoireItems.where('repertoireId').equals('rp').count()).toBe(2)
  })

  it('requires membership to duplicate an organization repertoire', async () => {
    await expect(duplicateRepertoire('r1')).rejects.toThrow('permissão')
    await db.organizationMemberships.put({ id: 'm1', organizationId: 'o1', userId: 'u1', role: 'member', createdAt: now, updatedAt: now } as never)
    expect(await duplicateRepertoire('r1')).toMatchObject({ organizationId: 'o1', name: 'Cópia de Domingo', createdByUserId: 'u1' })
  })
})

describe('setServiceItemKey', () => {
  beforeEach(async () => {
    await Promise.all([db.services.clear(), db.serviceItems.clear(), db.songs.clear(), db.targetSyncQueue.clear()])
    await db.services.put(service)
    await db.songs.put(song('a'))
    await db.serviceItems.bulkPut([
      { id: 'i1', serviceId: 's1', type: 'song', songId: 'a', position: 0, updatedAt: now },
      { id: 'i2', serviceId: 's1', type: 'prayer', title: 'Oração', position: 1, updatedAt: now },
    ])
  })

  it('sets the key, queues the item and leaves the song untouched', async () => {
    const result = await setServiceItemKey('i1', 'A', repos(leader))
    expect(result).toMatchObject({ success: true, item: { key: 'A' } })
    expect((await db.serviceItems.get('i1'))?.key).toBe('A')
    expect(await db.targetSyncQueue.count()).toBe(1)
    expect(await db.songs.get('a')).toMatchObject({ originalKey: 'G', currentKey: 'G' })
  })

  it('clears the key with undefined', async () => {
    await setServiceItemKey('i1', 'A', repos(leader))
    await setServiceItemKey('i1', undefined, repos(leader))
    expect(await db.serviceItems.get('i1')).not.toHaveProperty('key')
  })

  it('refuses another mode, a non-song item, a member and a final service', async () => {
    expect(await setServiceItemKey('i1', 'Am', repos(leader))).toMatchObject({ success: false })
    expect(await setServiceItemKey('i2', 'C', repos(leader))).toMatchObject({ success: false })
    expect(await setServiceItemKey('i1', 'A', repos(member))).toMatchObject({ success: false })
    await db.services.put({ ...service, status: 'completed' })
    expect(await setServiceItemKey('i1', 'A', repos(leader))).toMatchObject({ success: false })
    expect((await db.serviceItems.get('i1'))?.key).toBeUndefined()
  })
})
