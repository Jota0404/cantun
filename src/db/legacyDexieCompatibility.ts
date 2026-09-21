import type { SalmodiaDatabase } from './database'

export const LEGACY_DEXIE_STORES = [
  'bands',
  'bandMembers',
  'bandSongs',
  'bandSongMemberStates',
  'bandSetlists',
  'bandSetlistSongs',
  'bandSyncQueue',
] as const

export type LegacyDexieStoreName = typeof LEGACY_DEXIE_STORES[number]

export interface LegacyDexieStoreCounts {
  bands: number
  bandMembers: number
  bandSongs: number
  bandSongMemberStates: number
  bandSetlists: number
  bandSetlistSongs: number
  bandSyncQueue: number
}

export interface LegacyDexieRemovalGates {
  applicationConsumersRemoved: boolean
  supabaseConsumersRemoved: boolean
  syncConsumersRemoved: boolean
  legacyLinksResolved: boolean
  offlineOnlineValidated: boolean
}

export interface LegacyDexieCompatibilityState {
  counts: LegacyDexieStoreCounts
  hasLocalLegacyData: boolean
  hasPendingLegacySync: boolean
  removalGates: LegacyDexieRemovalGates
  readyForStoreRemoval: boolean
}

export async function getLegacyDexieStoreCounts(db: SalmodiaDatabase): Promise<LegacyDexieStoreCounts> {
  return {
    bands: await db.bands.count(),
    bandMembers: await db.bandMembers.count(),
    bandSongs: await db.bandSongs.count(),
    bandSongMemberStates: await db.bandSongMemberStates.count(),
    bandSetlists: await db.bandSetlists.count(),
    bandSetlistSongs: await db.bandSetlistSongs.count(),
    bandSyncQueue: await db.bandSyncQueue.count(),
  }
}

export function getLegacyDexieRemovalGates(overrides: Partial<LegacyDexieRemovalGates> = {}): LegacyDexieRemovalGates {
  return {
    applicationConsumersRemoved: false,
    supabaseConsumersRemoved: false,
    syncConsumersRemoved: false,
    legacyLinksResolved: false,
    offlineOnlineValidated: false,
    ...overrides,
  }
}

export function isLegacyDexieStoreRemovalReady(
  counts: LegacyDexieStoreCounts,
  gates: LegacyDexieRemovalGates,
): boolean {
  const hasLocalData = Object.entries(counts)
    .filter(([name]) => name !== 'bandSyncQueue')
    .some(([, count]) => count > 0)

  return !hasLocalData
    && counts.bandSyncQueue === 0
    && Object.values(gates).every(Boolean)
}

export async function getLegacyDexieCompatibilityState(
  db: SalmodiaDatabase,
  gates: Partial<LegacyDexieRemovalGates> = {},
): Promise<LegacyDexieCompatibilityState> {
  const counts = await getLegacyDexieStoreCounts(db)
  const removalGates = getLegacyDexieRemovalGates(gates)

  return {
    counts,
    hasLocalLegacyData: Object.entries(counts)
      .filter(([name]) => name !== 'bandSyncQueue')
      .some(([, count]) => count > 0),
    hasPendingLegacySync: counts.bandSyncQueue > 0,
    removalGates,
    readyForStoreRemoval: isLegacyDexieStoreRemovalReady(counts, removalGates),
  }
}
