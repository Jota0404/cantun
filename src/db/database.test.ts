import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Song } from '../domain/songs/song'
import { SalmodiaDatabase } from './database'

const db = new SalmodiaDatabase()

function buildSong(overrides: Partial<Song> = {}): Song {
  const now = new Date().toISOString()
  return {
    id: 'song-1',
    title: 'Grandioso És Tu',
    originalKey: 'G',
    currentKey: 'G',
    lyrics: 'G          D\nGrandioso és Tu, ó Deus...',
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('SalmodiaDatabase songs table', () => {
  beforeEach(async () => {
    await db.songs.clear()
  })

  it('persists a song and retrieves it by id', async () => {
    const song = buildSong()
    await db.songs.add(song)

    const stored = await db.songs.get(song.id)

    expect(stored).toEqual(song)
  })

  it('lists all persisted songs', async () => {
    await db.songs.add(buildSong({ id: 'song-1' }))
    await db.songs.add(buildSong({ id: 'song-2' }))

    const songs = await db.songs.toArray()

    expect(songs.map((s) => s.id).sort()).toEqual(['song-1', 'song-2'])
  })

  it('updates an existing song', async () => {
    const song = buildSong({ currentKey: 'G' })
    await db.songs.add(song)

    await db.songs.put({ ...song, currentKey: 'A' })

    const updated = await db.songs.get(song.id)
    expect(updated?.currentKey).toBe('A')
  })

  it('removes a song', async () => {
    const song = buildSong()
    await db.songs.add(song)

    await db.songs.delete(song.id)

    expect(await db.songs.get(song.id)).toBeUndefined()
  })

  it('rejects two songs with the same id', async () => {
    const song = buildSong()
    await db.songs.add(song)

    await expect(db.songs.add(song)).rejects.toThrow()
  })
})