import type { Song } from '../../domain/songs/song'
import { normalizeSongLyrics } from '../../domain/songs/normalizeSongLyrics'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'
import { getCurrentUser } from '../../platform/auth'
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
    const normalizedSong = normalizeSong(song)
    await this.db.songs.add(normalizedSong)
    await this.enqueueUpsert(normalizedSong)
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
    await queueLocalDelete(getCurrentUser()?.id ?? null, 'songs', id)
  }

  private async enqueueUpsert(song: Song) {
    await queueLocalUpsert(getCurrentUser()?.id ?? null, 'songs', song)
  }
}

export const songRepository = new SongRepository()
