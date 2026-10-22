import type { Song } from '../../domain/songs/song'
import { normalizeSongLyrics } from '../../domain/songs/normalizeSongLyrics'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'
import { getCurrentUser } from '../../platform/auth'
import { MaterialRepository } from './materialRepository'
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

  /** Biblioteca pessoal: sem as cópias dos Ministérios. */
  async list(): Promise<Song[]> {
    const songs = await this.db.songs.filter((song) => !song.organizationId).toArray()
    return songs.map(normalizeSong)
  }

  /** Cópias que pertencem à organização (Dexie, offline). */
  async listByOrganization(organizationId: string): Promise<Song[]> {
    return (await this.db.songs.where('organizationId').equals(organizationId).toArray()).map(normalizeSong)
  }

  /** Cópia já existente de uma música pessoal em uma organização. */
  async findCopy(organizationId: string, sourceSongId: string): Promise<Song | undefined> {
    return this.db.songs.where('organizationId').equals(organizationId).filter((song) => song.sourceSongId === sourceSongId).first()
  }

  /** Só Dexie, sem fila: a cópia nasce no servidor pela RPC. */
  async putLocal(song: Song): Promise<void> {
    await this.db.songs.put(normalizeSong(song))
  }

  async update(song: Song): Promise<void> {
    const normalizedSong = normalizeSong(song)
    await this.db.songs.put(normalizedSong)
    await this.enqueueUpsert(normalizedSong)
  }

  async remove(id: string): Promise<void> {
    const song = await this.db.songs.get(id)
    await new MaterialRepository(this.db).removeLocalByOwner('songId', [id])
    await this.db.songs.delete(id)
    await queueLocalDelete(getCurrentUser()?.id ?? null, 'songs', id, undefined, song)
  }

  private async enqueueUpsert(song: Song) {
    await queueLocalUpsert(getCurrentUser()?.id ?? null, 'songs', song)
  }
}

export const songRepository = new SongRepository()
