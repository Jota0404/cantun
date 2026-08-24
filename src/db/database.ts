import Dexie, { type Table } from 'dexie'
import type { Setlist } from '../domain/repertoires/setlist'
import type { SetlistSong } from '../domain/repertoires/setlistSong'
import type { Song } from '../domain/songs/song'

export class SalmodiaDatabase extends Dexie {
  songs!: Table<Song, string>
  setlists!: Table<Setlist, string>
  setlistSongs!: Table<SetlistSong, string>

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
  }
}

export const db = new SalmodiaDatabase()
