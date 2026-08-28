import type { Song } from '../../domain/songs/song'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'
import { supabase } from '../../lib/supabase'
import { queueLocalDelete, queueLocalUpsert } from '../../sync/syncService'

export class SongRepository {
  private readonly db: SalmodiaDatabase

  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }

  async create(song: Song): Promise<void> {
    await this.db.songs.add(song)
    await this.enqueueUpsert(song)
  }

  async getById(id: string): Promise<Song | undefined> {
    return this.db.songs.get(id)
  }

  async list(): Promise<Song[]> {
    return this.db.songs.toArray()
  }

  async update(song: Song): Promise<void> {
    await this.db.songs.put(song)
    await this.enqueueUpsert(song)
  }

  async remove(id: string): Promise<void> {
    await this.db.songs.delete(id)
    if (!supabase) return
    const { data } = await supabase.auth.getSession()
    await queueLocalDelete(data.session?.user.id ?? null, 'songs', id)
  }

  private async enqueueUpsert(song: Song) {
    if (!supabase) return
    const { data } = await supabase.auth.getSession()
    await queueLocalUpsert(data.session?.user.id ?? null, 'songs', song)
  }
}

export const songRepository = new SongRepository()
