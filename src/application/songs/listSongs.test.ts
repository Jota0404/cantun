import { describe, expect, it, vi } from 'vitest'
import type { Song } from '../../domain/songs/song'
import type { SongRepository } from '../../db/repositories/songRepository'
import { listSongs } from './listSongs'

function repositoryMock(songs: Song[] = []): SongRepository {
  return {
    getById: vi.fn(),
    list: vi.fn().mockResolvedValue(songs),
    update: vi.fn(),
    remove: vi.fn(),
  } as unknown as SongRepository
}

function song(overrides: Partial<Song> = {}): Song {
  return {
    id: 'song-1',
    title: 'Grandioso És Tu',
    originalKey: 'D',
    currentKey: 'D',
    lyrics: '[D]Grandioso és [A]Tu',
    bpm: 90,
    isFavorite: false,
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-22T10:00:00.000Z',
    ...overrides,
  }
}

describe('listSongs', () => {
  it('returns songs from the repository', async () => {
    const songs = [
      song(),
      song({
        id: 'song-2',
        title: 'Amazing Grace',
        originalKey: 'G',
        currentKey: 'G',
      }),
    ]

    const repository = repositoryMock(songs)

    const result = await listSongs(repository)

    expect(result).toEqual(songs)
  })

  it('returns an empty array when there are no songs', async () => {
    const repository = repositoryMock()

    const result = await listSongs(repository)

    expect(result).toEqual([])
  })

  it('delegates the query to the repository', async () => {
    const repository = repositoryMock()

    await listSongs(repository)

    expect(repository.list).toHaveBeenCalledTimes(1)
  })
})