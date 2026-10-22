import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const remote = vi.hoisted(() => ({ selectRows: vi.fn(), upsertRows: vi.fn(), updateRows: vi.fn(), deleteRows: vi.fn() }))
vi.mock('../../platform/sync', () => remote)
vi.mock('../../platform/rpc', () => ({ rpc: vi.fn() }))
vi.mock('../../application/teams/teamMemberService', async (orig) => ({ ...(await orig<object>()), getMyAccessContext: async () => ({ organizationRole: 'owner' }) }))
vi.mock('../../sync/syncService', async () => {
  const { db } = await import('../database')
  const { TargetSyncEngine } = await import('../../sync/targetSyncEngine')
  const engine = new TargetSyncEngine(db)
  return {
    queueTargetUpsert: (e: never, p: never) => engine.queueUpsert(e, p),
    queueTargetUpserts: (e: never, p: never, t: never, w: never) => engine.queueUpserts(e, p, t, w),
    queueTargetDeleteAtomic: (e: never, id: never, t: never, w: never) => engine.queueDeleteAtomic(e, id, t, w),
  }
})

import { db } from '../database'
import { removeServiceItem } from '../../application/services/serviceScheduleService'

const now = '2026-10-01T00:00:00.000Z'
const item = (id: string, position: number, refItemId?: string) => ({ id, serviceId: 's1', type: refItemId ? 'reprise' : 'song', songId: 'x', position, refItemId, updatedAt: now }) as never

describe('removeServiceItem with dependents (BUG-1)', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    remote.upsertRows.mockResolvedValue({ count: 1 })
    remote.deleteRows.mockResolvedValue({ count: 1 })
    await Promise.all([db.targetSyncQueue.clear(), db.serviceItems.clear(), db.services.clear()])
    await db.services.put({ id: 's1', organizationId: 'o1', teamId: 't1', name: 'Culto', startsAt: now, status: 'draft', createdByUserId: 'u1', createdAt: now, updatedAt: now })
    await db.serviceItems.bulkPut([item('t', 0), item('r1', 1, 't'), item('r2', 2, 't'), item('z', 3)])
  })

  it('never lets a pull bring back or re-upload the removed rows', async () => {
    const server = new Map(['t', 'r1', 'r2', 'z'].map((id, i) => [id, i]))
    remote.deleteRows.mockImplementation(async (_t: string, f: { id: string }) => { server.delete(f.id); return { count: 1 } })
    remote.upsertRows.mockImplementation(async (_t: string, rows: { id: string }[]) => { for (const r of rows) server.set(r.id, 0); return { count: rows.length } })
    remote.selectRows.mockImplementation(async (table: string) => table === 'service_items'
      ? [...server.keys()].map((id) => ({ id, service_id: 's1', type: 'song', song_id: 'x', position: 0, ref_item_id: null, updated_at: now })) : [])

    const result = await removeServiceItem('t')
    expect(result.success && result.items.map((i) => i.id)).toEqual(['z'])
    // Sobra no máximo o upsert da renumeração de `z` (retentado pelo timer); nunca um item removido.
    await vi.waitFor(async () => expect((await db.targetSyncQueue.toArray()).filter((i) => i.entity === 'serviceItems' && i.entityId !== 'z')).toEqual([]))
    expect([...server.keys()]).toEqual(['z'])
    expect((await db.serviceItems.toArray()).map((i) => i.id)).toEqual(['z'])
  })
})
