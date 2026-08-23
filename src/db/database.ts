import Dexie, { type Table } from 'dexie'
import type { Song } from '../domain/songs/song'

export class SalmodiaDatabase extends Dexie {
  songs!: Table<Song, string>

  constructor() {
    super('SalmodiaDatabase')

    this.version(1).stores({
      songs: 'id',
    })
  }
}

export const db = new SalmodiaDatabase()