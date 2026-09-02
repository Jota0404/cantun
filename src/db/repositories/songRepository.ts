import type { Song } from '../../domain/songs/song'
import { normalizeSongLyrics } from '../../domain/songs/normalizeSongLyrics'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'
import { supabase } from '../../lib/supabase'
import { queueLocalDelete, queueLocalUpsert } from '../../sync/syncService'

function normalizeSong(song: Song): Song {
  const lyrics = normalizeSongLyrics(song.lyrics)
  return lyrics === song.lyrics ? song : { ...song, lyrics }
}

export class SongRepository {
  private readonly db: SalmodiaDatabase

  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }

  async create(song: Song): Promise<void> {
    await this.db.songs.add(normalizeSong(song))
    await this.enqueueUpsert(normalizeSong(song))
  }

  async getById(id: string): Promise<Song | undefined> {
    const song = await this.db.songs.get(id)
    return song ? normalizeSong(song) : undefined
  }

  async list(): Promise<Song[]> {
    const songs = await this.db.songs.toArray()
    return songs.map(normalizeSong)
  }

  async update(song: Song): Promise<void> {
    const normalizedSong = normalizeSong(song)
    await this.db.songs.put(normalizedSong)
    await this.enqueueUpsert(normalizedSong)
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
