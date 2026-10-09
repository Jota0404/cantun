import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SalmodiaDatabase } from '../db/database'
import type { Song } from '../domain/songs/song'
import {
  LOCAL_DATA_OWNER_KEY,
  PendingLocalChangesError,
  clearLocalUserData,
  countPendingLocalChanges,
  ensureLocalDataOwner,
  signOutWithLocalCleanup,
  type KeyValueStorage,
} from './localSession'

const db = new SalmodiaDatabase()
const now = '2026-10-01T12:00:00.000Z'

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value) },
    removeItem: (key) => { data.delete(key) },
  }
}

function song(id: string): Song {
  return { id, title: `Song ${id}`, originalKey: 'G', currentKey: 'G', lyrics: 'G\nLetra', isFavorite: false, createdAt: now, updatedAt: now }
}

async function seedUserData() {
  await db.songs.add(song('song-a'))
  await db.organizations.add({ id: 'org-a', name: 'Igreja A', createdAt: now, updatedAt: now })
}

async function seedPendingChanges() {
  await db.syncQueue.add({ userId: 'user-a', entity: 'songs', entityId: 'song-a', operation: 'upsert', payload: song('song-a'), updatedAt: now, attempts: 0 })
  await db.targetSyncQueue.add({ entity: 'organizations', entityId: 'org-a', operation: 'upsert', payload: { id: 'org-a', name: 'Igreja A', createdAt: now, updatedAt: now }, updatedAt: now, attempts: 0 })
}

async function totalRows() {
  const counts = await Promise.all(db.tables.map((table) => table.count()))
  return counts.reduce((sum, count) => sum + count, 0)
}

describe('localSession', () => {
  beforeEach(async () => {
    await clearLocalUserData(db)
  })

  describe('clearLocalUserData', () => {
    it('removes every row from every table and keeps the schema usable', async () => {
      await seedUserData()
      await seedPendingChanges()

      await clearLocalUserData(db)

      expect(await totalRows()).toBe(0)
      await db.songs.add(song('after-clear'))
      expect(await db.songs.count()).toBe(1)
    })
  })

  describe('countPendingLocalChanges', () => {
    it('sums the song and target sync queues', async () => {
      await seedPendingChanges()

      expect(await countPendingLocalChanges(db)).toBe(2)
    })
  })

  describe('ensureLocalDataOwner', () => {
    it('keeps local data and registers the owner on the first login of the device', async () => {
      await seedUserData()
      const storage = memoryStorage()

      const cleared = await ensureLocalDataOwner(db, 'user-a', storage)

      expect(cleared).toBe(false)
      expect(await db.songs.count()).toBe(1)
      expect(storage.data.get(LOCAL_DATA_OWNER_KEY)).toBe('user-a')
    })

    it('keeps local data when the same user signs in again', async () => {
      await seedUserData()
      const storage = memoryStorage({ [LOCAL_DATA_OWNER_KEY]: 'user-a' })

      const cleared = await ensureLocalDataOwner(db, 'user-a', storage)

      expect(cleared).toBe(false)
      expect(await db.songs.count()).toBe(1)
    })

    it('clears data left by another user before the new session uses it', async () => {
      await seedUserData()
      await seedPendingChanges()
      const storage = memoryStorage({ [LOCAL_DATA_OWNER_KEY]: 'user-a' })

      const cleared = await ensureLocalDataOwner(db, 'user-b', storage)

      expect(cleared).toBe(true)
      expect(await totalRows()).toBe(0)
      expect(storage.data.get(LOCAL_DATA_OWNER_KEY)).toBe('user-b')
    })

    it('works without browser storage', async () => {
      await seedUserData()

      await expect(ensureLocalDataOwner(db, 'user-a', null)).resolves.toBe(false)
      expect(await db.songs.count()).toBe(1)
    })
  })

  describe('signOutWithLocalCleanup', () => {
    it('flushes, signs out remotely and clears local data and the owner marker', async () => {
      await seedUserData()
      const storage = memoryStorage({ [LOCAL_DATA_OWNER_KEY]: 'user-a' })
      const calls: string[] = []

      await signOutWithLocalCleanup({
        db,
        storage,
        flushPendingChanges: async () => { calls.push('flush') },
        signOutRemote: async () => { calls.push('signOut') },
      })

      expect(calls).toEqual(['flush', 'signOut'])
      expect(await totalRows()).toBe(0)
      expect(storage.data.has(LOCAL_DATA_OWNER_KEY)).toBe(false)
    })

    it('treats changes synced by the flush as no longer pending', async () => {
      await seedUserData()
      await seedPendingChanges()
      const signOutRemote = vi.fn(async () => {})

      await signOutWithLocalCleanup({
        db,
        storage: memoryStorage(),
        flushPendingChanges: async () => {
          await db.syncQueue.clear()
          await db.targetSyncQueue.clear()
        },
        signOutRemote,
      })

      expect(signOutRemote).toHaveBeenCalledOnce()
      expect(await totalRows()).toBe(0)
    })

    it('refuses to sign out while unsynced changes remain, keeping all local data', async () => {
      await seedUserData()
      await seedPendingChanges()
      const signOutRemote = vi.fn(async () => {})

      const attempt = signOutWithLocalCleanup({
        db,
        storage: memoryStorage(),
        flushPendingChanges: async () => { throw new Error('offline') },
        signOutRemote,
      })

      await expect(attempt).rejects.toBeInstanceOf(PendingLocalChangesError)
      await expect(attempt).rejects.toMatchObject({ pendingCount: 2 })
      expect(signOutRemote).not.toHaveBeenCalled()
      expect(await db.songs.count()).toBe(1)
      expect(await countPendingLocalChanges(db)).toBe(2)
    })

    it('discards unsynced changes only when explicitly confirmed', async () => {
      await seedUserData()
      await seedPendingChanges()

      await signOutWithLocalCleanup({
        db,
        storage: memoryStorage(),
        flushPendingChanges: async () => {},
        signOutRemote: async () => {},
      }, { discardPendingChanges: true })

      expect(await totalRows()).toBe(0)
    })

    it('keeps local data when the remote sign-out fails', async () => {
      await seedUserData()
      const storage = memoryStorage({ [LOCAL_DATA_OWNER_KEY]: 'user-a' })

      await expect(signOutWithLocalCleanup({
        db,
        storage,
        flushPendingChanges: async () => {},
        signOutRemote: async () => { throw new Error('network') },
      })).rejects.toThrow('network')

      expect(await db.songs.count()).toBe(1)
      expect(storage.data.get(LOCAL_DATA_OWNER_KEY)).toBe('user-a')
    })
  })
})
