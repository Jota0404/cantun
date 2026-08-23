import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Song } from '../../domain/songs/song'
import { SalmodiaDatabase } from '../database'
import { SongRepository } from './songRepository'

const db = new SalmodiaDatabase()
const repository = new SongRepository(db)

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

describe('SongRepository', () => {
  beforeEach(async () => {
    await db.songs.clear()
  })

  it('creates a song and retrieves it by id', async () => {
    const song = buildSong()
    await repository.create(song)

    expect(await repository.getById(song.id)).toEqual(song)
  })

  it('returns undefined when the song does not exist', async () => {
    expect(await repository.getById('missing')).toBeUndefined()
  })

  it('lists all persisted songs', async () => {
    await repository.create(buildSong({ id: 'song-1' }))
    await repository.create(buildSong({ id: 'song-2' }))

    const songs = await repository.list()

    expect(songs.map((s) => s.id).sort()).toEqual(['song-1', 'song-2'])
  })

  it('updates an existing song', async () => {
    const song = buildSong({ currentKey: 'G' })
    await repository.create(song)

    await repository.update({ ...song, currentKey: 'A' })

    expect((await repository.getById(song.id))?.currentKey).toBe('A')
  })

  it('removes a song', async () => {
    const song = buildSong()
    await repository.create(song)

    await repository.remove(song.id)

    expect(await repository.getById(song.id)).toBeUndefined()
  })

  it('uses the default shared database when none is injected', () => {
    expect(new SongRepository()).toBeInstanceOf(SongRepository)
  })
})