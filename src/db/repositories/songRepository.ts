import type { Song } from '../../domain/songs/song'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'

export class SongRepository {
  private readonly db: SalmodiaDatabase

  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }

  async create(song: Song): Promise<void> {
    await this.db.songs.add(song)
  }

  async getById(id: string): Promise<Song | undefined> {
    return this.db.songs.get(id)
  }

  async list(): Promise<Song[]> {
    return this.db.songs.toArray()
  }

  async update(song: Song): Promise<void> {
    await this.db.songs.put(song)
  }

  async remove(id: string): Promise<void> {
    await this.db.songs.delete(id)
  }
}

export const songRepository = new SongRepository()