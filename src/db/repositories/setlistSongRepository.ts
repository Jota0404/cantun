import type { SetlistSong } from '../../domain/repertoires/setlistSong'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'

export class SetlistSongRepository {
  private readonly db: SalmodiaDatabase

  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }

  async create(entry: SetlistSong): Promise<void> {
    await this.db.setlistSongs.add(entry)
  }

  async getById(id: string): Promise<SetlistSong | undefined> {
    return this.db.setlistSongs.get(id)
  }

  async listBySetlistId(setlistId: string): Promise<SetlistSong[]> {
    return this.db.setlistSongs.where('setlistId').equals(setlistId).sortBy('position')
  }

  async findBySetlistAndSong(
    setlistId: string,
    songId: string,
  ): Promise<SetlistSong | undefined> {
    return this.db.setlistSongs
      .where('[setlistId+songId]')
      .equals([setlistId, songId])
      .first()
  }

  async update(entry: SetlistSong): Promise<void> {
    await this.db.setlistSongs.put(entry)
  }

  async remove(id: string): Promise<void> {
    await this.db.setlistSongs.delete(id)
  }
}

export const setlistSongRepository = new SetlistSongRepository()
