import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { db } from '../database'

vi.mock('../../sync/syncService', () => ({ queueTargetDeleteAtomic: vi.fn(async (_e: string, _id: unknown, _t: unknown, write: () => Promise<void>) => write()), queueTargetUpsert: vi.fn(), queueTargetUpserts: vi.fn() }))

import { ServiceItemRepository } from './serviceItemRepository'

describe('ServiceItemRepository.remove', () => {
  it('clears local focus rows and queued focus upserts of the item', async () => {
    await db.rehearsalSongs.clear()
    await db.targetSyncQueue.clear()
    const now = new Date().toISOString()
    await db.rehearsalSongs.put({ rehearsalId: 'r1', serviceItemId: 'i1' })
    await db.targetSyncQueue.add({ entity: 'rehearsalSongs', entityId: 'r1:i1', operation: 'upsert', payload: { rehearsalId: 'r1', serviceItemId: 'i1' }, updatedAt: now, attempts: 0 })
    await db.targetSyncQueue.add({ entity: 'rehearsalSongs', entityId: 'r1:i2', operation: 'upsert', payload: { rehearsalId: 'r1', serviceItemId: 'i2' }, updatedAt: now, attempts: 0 })
    await new ServiceItemRepository(db).remove('i1')
    expect(await db.rehearsalSongs.count()).toBe(0)
    expect((await db.targetSyncQueue.toArray()).map((x) => x.entityId)).toEqual(['r1:i2'])
  })
})
