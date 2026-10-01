import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { SalmodiaDatabase } from './database'
import {
  getLegacyDexieCompatibilityState,
  getLegacyDexieRemovalGates,
  getLegacyDexieStoreCounts,
  isLegacyDexieStoreRemovalReady,
} from './legacyDexieCompatibility'

const db = new SalmodiaDatabase()

describe('legacyDexieCompatibility', () => {
  beforeEach(async () => {
    await db.transaction(
      'rw',
      [db.bands, db.bandMembers, db.bandSongs, db.bandSongMemberStates, db.bandSetlists, db.bandSetlistSongs, db.bandSyncQueue],
      async () => {
        await Promise.all([
          db.bands.clear(),
          db.bandMembers.clear(),
          db.bandSongs.clear(),
          db.bandSongMemberStates.clear(),
          db.bandSetlists.clear(),
          db.bandSetlistSongs.clear(),
          db.bandSyncQueue.clear(),
        ])
      },
    )
  })

  it('reports an empty legacy local footprint', async () => {
    const state = await getLegacyDexieCompatibilityState(db)

    expect(state.hasLocalLegacyData).toBe(false)
    expect(state.hasPendingLegacySync).toBe(false)
    expect(state.readyForStoreRemoval).toBe(false)
    expect(state.counts).toEqual({
      bands: 0,
      bandMembers: 0,
      bandSongs: 0,
      bandSongMemberStates: 0,
      bandSetlists: 0,
      bandSetlistSongs: 0,
      bandSyncQueue: 0,
    })
  })

  it('blocks removal while legacy local data remains', async () => {
    await db.bands.add({
      id: 'band-1',
      name: 'Legacy',
      ownerUserId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const counts = await getLegacyDexieStoreCounts(db)
    const gates = getLegacyDexieRemovalGates({
      applicationConsumersRemoved: true,
      supabaseConsumersRemoved: true,
      syncConsumersRemoved: true,
      legacyLinksResolved: true,
      offlineOnlineValidated: true,
    })

    expect(isLegacyDexieStoreRemovalReady(counts, gates)).toBe(false)
  })

  it('blocks removal while a legacy sync item is pending', async () => {
    await db.bandSyncQueue.add({
      userId: 'user-1',
      entity: 'bands',
      entityId: 'band-1',
      operation: 'delete',
      updatedAt: new Date().toISOString(),
      attempts: 0,
    })

    const counts = await getLegacyDexieStoreCounts(db)
    const gates = getLegacyDexieRemovalGates({
      applicationConsumersRemoved: true,
      supabaseConsumersRemoved: true,
      syncConsumersRemoved: true,
      legacyLinksResolved: true,
      offlineOnlineValidated: true,
    })

    expect(isLegacyDexieStoreRemovalReady(counts, gates)).toBe(false)
  })

  it('requires every migration gate before store removal', async () => {
    const counts = await getLegacyDexieStoreCounts(db)
    const gates = getLegacyDexieRemovalGates({
      applicationConsumersRemoved: true,
      supabaseConsumersRemoved: true,
      syncConsumersRemoved: true,
      legacyLinksResolved: true,
      offlineOnlineValidated: true,
    })

    expect(isLegacyDexieStoreRemovalReady(counts, gates)).toBe(true)
  })
})
