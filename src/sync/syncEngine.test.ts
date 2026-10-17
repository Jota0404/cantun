import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Song } from '../domain/songs/song'
import { SalmodiaDatabase } from '../db/database'
import { SyncEngine } from './syncEngine'
import { onRemoteDataApplied } from './remoteChanges'
import { ApiError } from '../platform/http'

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
  it('pulls Ministry copies with one request per organization and keeps personal pull free of them', async () => {
    await db.organizations.bulkPut([{ id: 'org-1', name: 'A', createdAt: '', updatedAt: '' }, { id: 'org-2', name: 'B', createdAt: '', updatedAt: '' }])
    const copy = (id: string, organization: string) => ({ ...remoteRow('2026-10-03T00:00:00Z', 'Cópia'), id, organization_id: organization, source_song_id: 'src', user_id: 'someone' })
    remote.selectRows.mockImplementation(async (_table: string, filters: Record<string, string>) => {
      if (filters.user_id) return [remoteRow('2026-10-03T00:00:00Z'), copy('mine-copy', 'org-1')]
      if (filters.organization_id === 'org-1') return [copy('c1', 'org-1')]
      if (filters.organization_id === 'org-2') return [copy('c2', 'org-2'), { ...copy('c3', 'org-2'), deleted_at: '2026-10-04T00:00:00Z' }]
      return []
    })
    await new SyncEngine(db).sync('user-1')

    expect((await db.songs.toArray()).map((s) => s.id).sort()).toEqual(['c1', 'c2', 'song-1'])
    expect(await db.songs.get('c1')).toMatchObject({ organizationId: 'org-1', sourceSongId: 'src' })
    expect(remote.selectRows.mock.calls.filter(([, filters]) => filters.organization_id).length).toBe(2)
  })

  it('pushes a copy edit by id with PATCH, never an upsert with my user_id (RN-A14)', async () => {
    const copy = { ...song('2026-10-05T00:00:00Z', 'Editada'), id: 'c1', organizationId: 'org-1', sourceSongId: 'src' }
    remote.selectRows.mockResolvedValue([{ ...remoteRow('2026-10-01T00:00:00Z'), id: 'c1', organization_id: 'org-1', user_id: 'author' }])
    remote.updateRows.mockResolvedValue({ count: 1 })
    await db.songs.put(copy)
    await db.syncQueue.add({ userId: 'user-1', entity: 'songs', entityId: 'c1', operation: 'upsert', payload: copy, updatedAt: copy.updatedAt, attempts: 0 })
    await new SyncEngine(db).sync('user-1')

    expect(remote.upsertRows).not.toHaveBeenCalled()
    const [table, filters, values] = remote.updateRows.mock.calls[0]
    expect([table, filters]).toEqual(['songs', { id: 'c1' }])
    expect(values).toMatchObject({ title: 'Editada' })
    expect(Object.keys(values)).not.toEqual(expect.arrayContaining(['user_id']))
    expect(values).not.toHaveProperty('organization_id')
    expect(values).not.toHaveProperty('source_song_id')
    expect(await db.syncQueue.count()).toBe(0)
  })

  it('deletes a copy by id (soft delete) using the payload saved in the queue', async () => {
    const copy = { ...song('2026-10-05T00:00:00Z'), id: 'c1', organizationId: 'org-1' }
    remote.selectRows.mockResolvedValue([])
    remote.updateRows.mockResolvedValue({ count: 1 })
    const engine = new SyncEngine(db)
    await db.syncQueue.add({ userId: 'user-1', entity: 'songs', entityId: 'c1', operation: 'delete', payload: copy, updatedAt: copy.updatedAt, attempts: 0 })
    await engine.sync('user-1')
    expect(remote.updateRows).toHaveBeenCalledWith('songs', { id: 'c1' }, { deleted_at: copy.updatedAt })
  })
  it('keeps a copy edit in the queue when the server answers count 0 (RLS denied)', async () => {
    const copy = { ...song('2026-10-05T00:00:00Z', 'Negada'), id: 'c1', organizationId: 'org-1' }
    remote.selectRows.mockResolvedValue([{ ...remoteRow('2026-10-01T00:00:00Z'), id: 'c1', organization_id: 'org-1', user_id: 'author' }])
    remote.updateRows.mockResolvedValue({ count: 0 })
    await db.syncQueue.add({ userId: 'user-1', entity: 'songs', entityId: 'c1', operation: 'upsert', payload: copy, updatedAt: copy.updatedAt, attempts: 0 })
    await new SyncEngine(db).sync('user-1')

    const [item] = await db.syncQueue.toArray()
    expect(item).toMatchObject({ entityId: 'c1', attempts: 1 })
  })

  it('keeps a copy delete queued on count 0, but drops the delete of a personal song the server never had', async () => {
    const copy = { ...song('2026-10-05T00:00:00Z'), id: 'c1', organizationId: 'org-1' }
    remote.updateRows.mockResolvedValue({ count: 0 })
    remote.selectRows.mockResolvedValue([])
    await db.syncQueue.bulkAdd([
      { userId: 'user-1', entity: 'songs', entityId: 'c1', operation: 'delete', payload: copy, updatedAt: copy.updatedAt, attempts: 0 },
      { userId: 'user-1', entity: 'songs', entityId: 'never-synced', operation: 'delete', updatedAt: copy.updatedAt, attempts: 0 },
    ])
    await new SyncEngine(db).sync('user-1')
    expect((await db.syncQueue.toArray()).map((item) => [item.entityId, item.attempts])).toEqual([['c1', 1]])
  })

  it('keeps a personal delete queued when the row exists but count is 0', async () => {
    remote.selectRows.mockResolvedValue([{ ...remoteRow('2026-10-01T00:00:00Z') }])
    remote.updateRows.mockResolvedValue({ count: 0 })
    await db.syncQueue.add({ userId: 'user-1', entity: 'songs', entityId: 'song-1', operation: 'delete', updatedAt: '2026-10-05T00:00:00Z', attempts: 0 })
    await new SyncEngine(db).sync('user-1')
    expect((await db.syncQueue.toArray())[0]).toMatchObject({ entityId: 'song-1', attempts: 1 })
  })

  it('stops resending a permanent 403, counts it and discards it with the local edit; network errors keep retrying', async () => {
    remote.selectRows.mockResolvedValue([remoteRow('2026-10-01T00:00:00Z')])
    remote.upsertRows.mockRejectedValue(new ApiError(403, 'sem permissão'))
    const engine = new SyncEngine(db)
    await db.songs.put(song('2026-10-02T00:00:00Z', 'Editada'))
    await queue(song('2026-10-02T00:00:00Z', 'Editada'))

    await engine.sync('user-1')
    await engine.sync('user-1')
    expect(remote.upsertRows).toHaveBeenCalledTimes(1)
    expect(await engine.getStatus()).toEqual({ pending: 0, failed: [{ id: expect.any(Number), entity: 'songs', reason: 'sem permissão' }] })

    await engine.discardFailed()
    expect(await db.syncQueue.count()).toBe(0)
    expect(await db.songs.get('song-1')).toBeUndefined()

    remote.upsertRows.mockRejectedValue(new ApiError(0, 'rede'))
    await db.songs.put(song('2026-10-03T00:00:00Z'))
    await queue(song('2026-10-03T00:00:00Z'))
    await engine.sync('user-1')
    expect(await engine.getStatus()).toEqual({ pending: 1, failed: [] })
  })
})
