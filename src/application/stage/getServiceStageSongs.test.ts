import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/database'

const platform = vi.hoisted(() => ({ configured: false }))
vi.mock('../../platform/http', () => ({ get isPlatformConfigured() { return platform.configured } }))
vi.mock('../../platform/rpc', () => ({ rpc: vi.fn() }))
vi.mock('../../platform/auth', () => ({ getCurrentUser: () => ({ id: 'u1' }) }))

import { rpc } from '../../platform/rpc'
import { getServiceStageSongs } from './getServiceStageSongs'

const now = '2026-10-01T12:00:00Z'
const song = (id: string) => ({ id, title: id, originalKey: 'G' as const, currentKey: 'G' as const, lyrics: '', isFavorite: false, createdAt: now, updatedAt: now })

describe('getServiceStageSongs key (RN-08)', () => {
  beforeEach(async () => {
    await Promise.all([db.stageSessions.clear(), db.serviceItems.clear(), db.songs.clear(), db.assignments.clear()])
    await db.stageSessions.put({ id: 'st1', serviceId: 's1', status: 'live', createdAt: now, updatedAt: now })
    await db.songs.bulkPut([song('a'), song('b')])
    await db.serviceItems.bulkPut([
      { id: 'i1', serviceId: 's1', type: 'song', songId: 'a', position: 0, key: 'A', updatedAt: now },
      { id: 'i2', serviceId: 's1', type: 'song', songId: 'b', position: 1, updatedAt: now },
    ])
  })

  it('shows the same keys offline (Dexie) and online (RPC coalesce)', async () => {
    platform.configured = false
    const offline = await getServiceStageSongs('st1')
    expect(offline.map((s) => s.currentKey)).toEqual(['A', 'G'])

    platform.configured = true
    vi.mocked(rpc).mockResolvedValue([
      { position: 0, song_id: 'a', title: 'a', artist: null, original_key: 'G', current_key: 'A', lyrics: '', notes: null, bpm: null, musical_role: null },
      { position: 1, song_id: 'b', title: 'b', artist: null, original_key: 'G', current_key: 'G', lyrics: '', notes: null, bpm: null, musical_role: null },
    ])
    const online = await getServiceStageSongs('st1')
    expect(online.map((s) => s.currentKey)).toEqual(offline.map((s) => s.currentKey))
  })

  it('ignores reprise and medley items in the Stage order (D6)', async () => {
    platform.configured = false
    await db.serviceItems.bulkPut([
      { id: 'r1', serviceId: 's1', type: 'reprise', title: 'Reprise: a', refItemId: 'i1', position: 2, updatedAt: now },
      { id: 'm1', serviceId: 's1', type: 'medley', title: 'Medley: b', refItemId: 'i2', position: 3, updatedAt: now },
    ])
    expect((await getServiceStageSongs('st1')).map((s) => s.songId)).toEqual(['a', 'b'])
  })
})
