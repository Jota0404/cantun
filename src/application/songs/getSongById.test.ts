import { describe, expect, it, vi } from 'vitest'
import type { Song } from '../../domain/songs/song'
import type { SongRepository } from '../../db/repositories/songRepository'
import { getSongById } from './getSongById'

function song(): Song {
  return {
    id: 'song-1',
    title: 'Grandioso És Tu',
    originalKey: 'D',
    currentKey: 'E',
    lyrics: '[E]Grandioso és [B]Tu',
    bpm: 90,
    isFavorite: false,
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-22T10:00:00.000Z',
  }
}

describe('getSongById', () => {
  it('returns the song when it exists', async () => {
    const expectedSong = song()

    const repository = {
      getById: vi.fn().mockResolvedValue(expectedSong),
    } as unknown as SongRepository

    const result = await getSongById('song-1', repository)

    expect(result).toEqual(expectedSong)
    expect(repository.getById).toHaveBeenCalledWith('song-1')
  })

  it('returns undefined when the song does not exist', async () => {
    const repository = {
      getById: vi.fn().mockResolvedValue(undefined),
    } as unknown as SongRepository

    const result = await getSongById('missing-song', repository)

    expect(result).toBeUndefined()
    expect(repository.getById).toHaveBeenCalledWith('missing-song')
  })
})