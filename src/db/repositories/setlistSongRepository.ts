import type { SetlistSong } from '../../domain/repertoires/setlistSong'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'
import { supabase } from '../../lib/supabase'
import { queueLocalDelete, queueLocalUpsert } from '../../sync/syncService'

export class SetlistSongRepository {
  private readonly db: SalmodiaDatabase

  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }

  async create(entry: SetlistSong): Promise<void> {
    await this.db.setlistSongs.add(entry)
    await this.enqueueUpsert(entry)
  }

  async getById(id: string): Promise<SetlistSong | undefined> {
    return this.db.setlistSongs.get(id)
  }

  async listBySetlistId(setlistId: string): Promise<SetlistSong[]> {
    return this.db.setlistSongs.where('setlistId').equals(setlistId).sortBy('position')
  }

  async listBySongId(songId: string): Promise<SetlistSong[]> {
    return this.db.setlistSongs.where('songId').equals(songId).toArray()
  }

  async findBySetlistAndSong(setlistId: string, songId: string): Promise<SetlistSong | undefined> {
    return this.db.setlistSongs.where('[setlistId+songId]').equals([setlistId, songId]).first()
  }

  async update(entry: SetlistSong): Promise<void> {
    await this.db.setlistSongs.put(entry)
    await this.enqueueUpsert(entry)
  }

  async remove(id: string): Promise<void> {
    const entry = await this.db.setlistSongs.get(id)
    const updatedAt = entry?.updatedAt ?? new Date().toISOString()
    await this.db.setlistSongs.delete(id)
    if (!supabase) return
    const { data } = await supabase.auth.getSession()
    await queueLocalDelete(data.session?.user.id ?? null, 'setlistSongs', id, updatedAt)
  }

  private async enqueueUpsert(entry: SetlistSong) {
    if (!supabase) return
    const { data } = await supabase.auth.getSession()
    await queueLocalUpsert(data.session?.user.id ?? null, 'setlistSongs', entry)
  }
}

export const setlistSongRepository = new SetlistSongRepository()
