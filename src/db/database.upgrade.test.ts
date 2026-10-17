import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Song } from '../domain/songs/song'
import { SalmodiaDatabase } from './database'

const DB_NAME = 'SalmodiaDatabase'
const now = '2026-10-09T12:00:00.000Z'

const LEGACY_STORES = [
  'setlists',
  'setlistSongs',
  'bands',
  'bandMembers',
  'bandSongs',
  'bandSongMemberStates',
  'bandSetlists',
  'bandSetlistSongs',
  'bandSyncQueue',
]

/** Esquema da versão 10 do Dexie, exatamente como foi publicado. */
async function seedVersion10() {
  const legacy = new Dexie(DB_NAME)
  legacy.version(10).stores({
    songs: 'id, updatedAt', setlists: 'id, name, updatedAt',
    setlistSongs: 'id, setlistId, songId, position, updatedAt, [setlistId+position], [setlistId+songId]',
    syncQueue: '++id, userId, entity, entityId, updatedAt, [userId+entity], [userId+entity+entityId]',
    bands: 'id, ownerUserId, updatedAt', bandMembers: 'id, bandId, userId, [bandId+userId], updatedAt',
    bandSongs: 'id, bandId, sourceSongId, [bandId+sourceSongId], updatedAt',
    bandSongMemberStates: 'id, bandSongId, userId, [bandSongId+userId], updatedAt',
    bandSetlists: 'id, bandId, createdByUserId, updatedAt',
    bandSetlistSongs: 'id, bandSetlistId, bandSongId, position, updatedAt, [bandSetlistId+position], [bandSetlistId+bandSongId]',
    bandSyncQueue: '++id, userId, entity, entityId, updatedAt, [userId+entity], [userId+entity+entityId]',
    organizations: 'id, updatedAt',
    organizationMemberships: 'id, organizationId, userId, [organizationId+userId], updatedAt',
    teams: 'id, organizationId, updatedAt',
    teamMemberships: 'id, teamId, userId, [teamId+userId], updatedAt',
    organizationSongs: 'id, organizationId, songId, [organizationId+songId], updatedAt',
    repertoires: 'id, organizationId, updatedAt',
    repertoireItems: 'id, repertoireId, songId, position, updatedAt, [repertoireId+position], [repertoireId+songId]',
    services: 'id, organizationId, startsAt, status, updatedAt',
    serviceItems: 'id, serviceId, songId, position, updatedAt, [serviceId+position]',
    assignments: 'id, serviceId, userId, musicalFunction, status, updatedAt, [serviceId+userId]',
    targetSyncQueue: '++id, entity, entityId, updatedAt, [entity+entityId]',
    stageSessions: 'id, serviceId, status, updatedAt',
    stageSessionStates: 'stageSessionId, revision, currentIndex, currentSongId, updatedAt',
  })

  const song = { id: 'song-1', title: 'Grandioso És Tu', originalKey: 'G', currentKey: 'G', lyrics: 'G\nLetra', isFavorite: false, createdAt: now, updatedAt: now }
  await legacy.table('songs').add(song)
  await legacy.table('setlists').add({ id: 'setlist-1', name: 'Culto', createdAt: now, updatedAt: now })
  await legacy.table('setlistSongs').add({ id: 'entry-1', setlistId: 'setlist-1', songId: 'song-1', position: 0, updatedAt: now })
  await legacy.table('bands').add({ id: 'band-1', name: 'Banda', ownerUserId: 'user-a', createdAt: now, updatedAt: now })
  await legacy.table('bandSyncQueue').add({ userId: 'user-a', entity: 'bands', entityId: 'band-1', operation: 'upsert', updatedAt: now, attempts: 0 })
  await legacy.table('syncQueue').bulkAdd([
    { userId: 'user-a', entity: 'songs', entityId: 'song-1', operation: 'upsert', payload: song, updatedAt: now, attempts: 0 },
    { userId: 'user-a', entity: 'setlists', entityId: 'setlist-1', operation: 'upsert', updatedAt: now, attempts: 0 },
    { userId: 'user-a', entity: 'setlistSongs', entityId: 'entry-1', operation: 'delete', updatedAt: now, attempts: 1 },
  ])
  await legacy.table('organizations').add({ id: 'org-1', name: 'Igreja', createdAt: now, updatedAt: now })
  await legacy.table('targetSyncQueue').add({ entity: 'organizations', entityId: 'org-1', operation: 'upsert', updatedAt: now, attempts: 0 })
  legacy.close()
  return song
}

describe('SalmodiaDatabase version 11 (legacy Band/Setlist removal)', () => {
  let db: SalmodiaDatabase

  beforeEach(async () => {
    await Dexie.delete(DB_NAME)
  })

  afterEach(() => {
    db?.close()
  })

  it('drops the legacy stores and keeps the core data intact', async () => {
    const song = await seedVersion10()

    db = new SalmodiaDatabase()
    await db.open()

    const stores = Array.from(db.backendDB().objectStoreNames)
    for (const name of LEGACY_STORES) expect(stores).not.toContain(name)
    expect(db.tables.map((table) => table.name)).not.toEqual(expect.arrayContaining(['setlists', 'bands']))

    expect(await db.songs.toArray()).toEqual([song])
    expect((await db.organizations.get('org-1'))?.name).toBe('Igreja')
    expect(await db.targetSyncQueue.count()).toBe(1)
  })

  it('removes setlist items from syncQueue and keeps the song items', async () => {
    await seedVersion10()

    db = new SalmodiaDatabase()
    await db.open()

    const queue = await db.syncQueue.toArray()
    expect(queue.map((item) => [item.entity, item.entityId])).toEqual([['songs', 'song-1']])
  })

  it('creates a fresh database at the current version without legacy stores', async () => {
    db = new SalmodiaDatabase()
    await db.open()

    const stores = Array.from(db.backendDB().objectStoreNames)
    for (const name of LEGACY_STORES) expect(stores).not.toContain(name)
    expect(stores).toEqual(expect.arrayContaining(['songs', 'syncQueue', 'targetSyncQueue', 'stageSessions', 'stageSessionStates']))
  })
})

describe('SalmodiaDatabase version 12 (team roles and status)', () => {
  let db: SalmodiaDatabase

  beforeEach(async () => {
    await Dexie.delete(DB_NAME)
  })

  afterEach(() => {
    db?.close()
  })

  it('defaults existing team memberships to member/active', async () => {
    await seedVersion10()
    const legacy = new Dexie(DB_NAME)
    legacy.version(10).stores({ teamMemberships: 'id, teamId, userId, [teamId+userId], updatedAt' })
    await legacy.table('teamMemberships').add({ id: 'tm-1', teamId: 'team-1', userId: 'user-a', createdAt: now, updatedAt: now })
    legacy.close()

    db = new SalmodiaDatabase()
    await db.open()

    expect(await db.teamMemberships.get('tm-1')).toMatchObject({ role: 'member', status: 'active' })
    expect(await db.teamMemberships.where('[teamId+userId]').equals(['team-1', 'user-a']).count()).toBe(1)
  })
})

describe('SalmodiaDatabase version 13 (operational service)', () => {
  let db: SalmodiaDatabase

  beforeEach(async () => {
    await Dexie.delete(DB_NAME)
  })

  afterEach(() => {
    db?.close()
  })

  it('maps old statuses, assigns the oldest team and marks items as songs', async () => {
    await seedVersion10()
    const legacy = new Dexie(DB_NAME)
    legacy.version(10).stores({ teams: 'id, organizationId, updatedAt', services: 'id, organizationId, startsAt, status, updatedAt', serviceItems: 'id, serviceId, songId, position, updatedAt, [serviceId+position]' })
    await legacy.table('teams').bulkAdd([
      { id: 'team-new', organizationId: 'org-1', name: 'B', createdAt: '2026-10-02T00:00:00Z', updatedAt: now },
      { id: 'team-old', organizationId: 'org-1', name: 'A', createdAt: '2026-10-01T00:00:00Z', updatedAt: now },
    ])
    await legacy.table('services').bulkAdd([
      { id: 'svc-1', organizationId: 'org-1', name: 'Culto', startsAt: now, status: 'planned', createdByUserId: 'u', createdAt: now, updatedAt: now },
      { id: 'svc-2', organizationId: 'org-1', name: 'Ceia', startsAt: now, status: 'confirmed', createdByUserId: 'u', createdAt: now, updatedAt: now },
      { id: 'svc-3', organizationId: 'org-2', name: 'Outro', startsAt: now, status: 'completed', createdByUserId: 'u', createdAt: now, updatedAt: now },
    ])
    await legacy.table('serviceItems').add({ id: 'item-1', serviceId: 'svc-1', songId: 'song-1', position: 0, updatedAt: now })
    legacy.close()

    db = new SalmodiaDatabase()
    await db.open()

    expect(await db.services.get('svc-1')).toMatchObject({ status: 'draft', teamId: 'team-old' })
    expect(await db.services.get('svc-2')).toMatchObject({ status: 'ready', teamId: 'team-old' })
    expect(await db.services.get('svc-3')).toMatchObject({ status: 'completed', teamId: null })
    expect(await db.serviceItems.get('item-1')).toMatchObject({ type: 'song', songId: 'song-1' })
    expect(await db.services.where('teamId').equals('team-old').count()).toBe(2)
  })
})

describe('SalmodiaDatabase version 14 (scheduling)', () => {
  let db: SalmodiaDatabase

  beforeEach(async () => {
    await Dexie.delete(DB_NAME)
  })

  afterEach(() => {
    db?.close()
  })

  it('maps pending/accepted assignments and creates the new stores', async () => {
    await seedVersion10()
    const legacy = new Dexie(DB_NAME)
    legacy.version(10).stores({ assignments: 'id, serviceId, userId, musicalFunction, status, updatedAt, [serviceId+userId]' })
    const base = { serviceId: 'svc-1', userId: 'u', musicalFunction: 'vocals', createdAt: now, updatedAt: now }
    await legacy.table('assignments').bulkAdd([
      { ...base, id: 'a1', status: 'pending' }, { ...base, id: 'a2', status: 'accepted' }, { ...base, id: 'a3', status: 'declined' },
    ])
    legacy.close()

    db = new SalmodiaDatabase()
    await db.open()

    expect((await db.assignments.toArray()).map((a) => [a.id, a.status, a.positionId])).toEqual([['a1', 'invited', null], ['a2', 'confirmed', null], ['a3', 'declined', null]])
    const stores = Array.from(db.backendDB().objectStoreNames)
    expect(stores).toEqual(expect.arrayContaining(['servicePositions', 'memberAvailability']))
    expect(await db.assignments.where('status').equals('confirmed').count()).toBe(1)
    expect(await db.memberAvailability.where('[organizationId+date]').equals(['o', '2026-10-11']).count()).toBe(0)
  })
})

describe('SalmodiaDatabase version 15 (member profiles cache)', () => {
  let db: SalmodiaDatabase

  beforeEach(async () => {
    await Dexie.delete(DB_NAME)
  })

  afterEach(() => {
    db?.close()
  })

  it('adds memberProfiles keyed by organization and user, and keeps existing data', async () => {
    const song = await seedVersion10()

    db = new SalmodiaDatabase()
    await db.open()

    expect(await db.songs.toArray()).toEqual([song])
    expect(Array.from(db.backendDB().objectStoreNames)).toContain('memberProfiles')
    await db.memberProfiles.bulkPut([
      { userId: 'u1', displayName: 'Ana', organizationId: 'o1', updatedAt: now },
      { userId: 'u2', displayName: 'Bia', organizationId: 'o2', updatedAt: now },
      { userId: 'u1', displayName: 'Ana', organizationId: 'o2', updatedAt: now },
    ])
    expect(await db.memberProfiles.count()).toBe(3)
    expect((await db.memberProfiles.where('organizationId').equals('o1').toArray()).map((p) => p.displayName)).toEqual(['Ana'])
    expect((await db.memberProfiles.where('organizationId').equals('o2').toArray()).map((p) => p.userId).sort()).toEqual(['u1', 'u2'])
  })
})

describe('SalmodiaDatabase version 16 (song copies)', () => {
  let db: SalmodiaDatabase

  beforeEach(async () => {
    await Dexie.delete(DB_NAME)
  })

  afterEach(() => {
    db?.close()
  })

  it('keeps existing songs as personal and indexes copies by organization', async () => {
    const song = await seedVersion10()

    db = new SalmodiaDatabase()
    await db.open()

    expect(await db.songs.toArray()).toEqual([song])
    expect(await db.songs.filter((item) => !item.organizationId).count()).toBe(1)
    await db.songs.put({ ...(song as unknown as Song), id: 'copy-1', organizationId: 'org-1', sourceSongId: song.id })
    expect((await db.songs.where('organizationId').equals('org-1').toArray()).map((item) => item.id)).toEqual(['copy-1'])
  })
})

describe('SalmodiaDatabase version 17 (organizationSongs removal)', () => {
  let db: SalmodiaDatabase

  beforeEach(async () => {
    await Dexie.delete(DB_NAME)
  })

  afterEach(() => {
    db?.close()
  })

  it('drops the organizationSongs store and keeps songs and organizations intact', async () => {
    const song = await seedVersion10()
    const legacy = new Dexie(DB_NAME)
    legacy.version(10).stores({ organizationSongs: 'id, organizationId, songId, [organizationId+songId], updatedAt' })
    await legacy.table('organizationSongs').add({ id: 'link-1', organizationId: 'org-1', songId: song.id, createdAt: now, updatedAt: now })
    legacy.close()

    db = new SalmodiaDatabase()
    await db.open()

    expect(Array.from(db.backendDB().objectStoreNames)).not.toContain('organizationSongs')
    expect(db.tables.map((table) => table.name)).not.toContain('organizationSongs')
    expect(await db.songs.toArray()).toEqual([song])
    expect((await db.organizations.get('org-1'))?.name).toBe('Igreja')
  })
})

describe('SalmodiaDatabase version 18 (personal repertoires)', () => {
  let db: SalmodiaDatabase

  beforeEach(async () => {
    await Dexie.delete(DB_NAME)
  })

  afterEach(() => {
    db?.close()
  })

  it('keeps organization repertoires and lists personal ones (no organization) by owner', async () => {
    await seedVersion10()
    const legacy = new Dexie(DB_NAME)
    legacy.version(10).stores({ repertoires: 'id, organizationId, updatedAt' })
    const base = { name: 'R', version: 1, createdAt: now, updatedAt: now }
    await legacy.table('repertoires').add({ ...base, id: 'r1', organizationId: 'org-1', createdByUserId: 'u1' })
    legacy.close()

    db = new SalmodiaDatabase()
    await db.open()

    expect((await db.repertoires.toArray()).map((r) => r.id)).toEqual(['r1'])
    await db.repertoires.bulkPut([{ ...base, id: 'p1', createdByUserId: 'u1' }, { ...base, id: 'p2', createdByUserId: 'u2' }])
    const mine = await db.repertoires.where('createdByUserId').equals('u1').toArray()
    expect(mine.filter((r) => !r.organizationId).map((r) => r.id)).toEqual(['p1'])
    expect((await db.repertoires.where('organizationId').equals('org-1').toArray()).map((r) => r.id)).toEqual(['r1'])
  })
})
