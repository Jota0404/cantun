import Dexie, { type Table } from 'dexie'
import type { Setlist } from '../domain/repertoires/setlist'
import type { SetlistSong } from '../domain/repertoires/setlistSong'
import type { Song } from '../domain/songs/song'
import type { SyncQueueItem } from '../sync/syncEngine'

export class SalmodiaDatabase extends Dexie {
  songs!: Table<Song, string>
  setlists!: Table<Setlist, string>
  setlistSongs!: Table<SetlistSong, string>
  syncQueue!: Table<SyncQueueItem, number>

  constructor() {
    super('SalmodiaDatabase')

    this.version(1).stores({
      songs: 'id',
    })

    this.version(2).stores({
      songs: 'id',
      setlists: 'id, name, updatedAt',
      setlistSongs:
        'id, setlistId, songId, position, [setlistId+position], [setlistId+songId]',
    })

    this.version(3).stores({
      songs: 'id, updatedAt',
      setlists: 'id, name, updatedAt',
      setlistSongs:
        'id, setlistId, songId, position, [setlistId+position], [setlistId+songId]',
      syncQueue: '++id, userId, entity, entityId, updatedAt, [userId+entity], [userId+entity+entityId]',
    })

    this.version(4)
      .stores({
        songs: 'id, updatedAt',
        setlists: 'id, name, updatedAt',
        setlistSongs:
          'id, setlistId, songId, position, updatedAt, [setlistId+position], [setlistId+songId]',
        syncQueue: '++id, userId, entity, entityId, updatedAt, [userId+entity], [userId+entity+entityId]',
      })
      .upgrade(async (transaction) => {
        const now = new Date().toISOString()
        await transaction
          .table<SetlistSong, string>('setlistSongs')
          .toCollection()
          .modify((entry) => {
            if (!entry.updatedAt) entry.updatedAt = now
          })
      })
  }
}

export const db = new SalmodiaDatabase()
