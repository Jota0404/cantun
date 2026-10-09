import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Song } from '../domain/songs/song'
import { SalmodiaDatabase } from '../db/database'
import { SyncEngine } from './syncEngine'
import { onRemoteDataApplied } from './remoteChanges'

const remote = vi.hoisted(() => ({ selectRows: vi.fn(), upsertRows: vi.fn(), updateRows: vi.fn() }))
vi.mock('../platform/sync', () => remote)

const db = new SalmodiaDatabase()

function queue(value: Song) {
  return db.syncQueue.add({ userId: 'user-1', entity: 'songs', entityId: value.id, operation: 'upsert', payload: value, updatedAt: value.updatedAt, attempts: 0 })
}

function song(updatedAt: string, title = 'Local'): Song {
  return { id: 'song-1', title, originalKey: 'G', currentKey: 'G', lyrics: '', isFavorite: false, createdAt: updatedAt, updatedAt }
}

function remoteRow(updatedAt: string, title = 'Remota') {
  return { id: 'song-1', user_id: 'user-1', title, artist: null, original_key: 'G', current_key: 'G', bpm: null, lyrics: '', notes: null, is_favorite: false, created_at: updatedAt, updated_at: updatedAt, deleted_at: null }
}

describe('SyncEngine (songs)', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    await Promise.all([db.songs.clear(), db.syncQueue.clear()])
  })

  it('pushes a newer local change and drains the queue', async () => {
    remote.selectRows.mockResolvedValue([remoteRow('2026-10-01T00:00:00Z')])
    remote.upsertRows.mockResolvedValue({ count: 1 })
    const engine = new SyncEngine(db)

    await db.songs.put(song('2026-10-02T00:00:00Z'))
    await queue(song('2026-10-02T00:00:00Z'))
    await engine.sync('user-1')

    expect(remote.upsertRows).toHaveBeenCalledWith('songs', [expect.objectContaining({ id: 'song-1', user_id: 'user-1', title: 'Local', deleted_at: null })])
    expect(await db.syncQueue.count()).toBe(0)
  })

  it('keeps the remote row when it is newer (LWW) and pulls it', async () => {
    remote.selectRows.mockResolvedValue([remoteRow('2026-10-03T00:00:00Z')])
    const engine = new SyncEngine(db)

    await db.songs.put(song('2026-10-02T00:00:00Z'))
    await queue(song('2026-10-02T00:00:00Z'))
    await engine.sync('user-1')

    expect(remote.upsertRows).not.toHaveBeenCalled()
    expect((await db.songs.get('song-1'))?.title).toBe('Remota')
  })

  it('notifies listeners after pulling remote data', async () => {
    remote.selectRows.mockResolvedValue([remoteRow('2026-10-03T00:00:00Z')])
    const listener = vi.fn()
    const off = onRemoteDataApplied(listener)
    await new SyncEngine(db).sync('user-1')
    off()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(await db.songs.get('song-1')).toBeDefined()
  })

  it('keeps the item queued when the server is unreachable', async () => {
    remote.selectRows.mockRejectedValue(new TypeError('Failed to fetch'))
    const engine = new SyncEngine(db)

    await queue(song('2026-10-02T00:00:00Z'))
    await engine.sync('user-1')

    const [item] = await db.syncQueue.toArray()
    expect(item.attempts).toBeGreaterThan(0)
  })
})
