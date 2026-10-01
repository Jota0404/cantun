import { describe, expect, it, vi } from 'vitest'
import type { Song } from '../../domain/songs/song'
import type { SongRepository } from '../../db/repositories/songRepository'
import { transposeSong } from './transposeSong'

const song = (overrides: Partial<Song> = {}): Song => ({
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
})

const repo = (value: Song | undefined): SongRepository =>
  ({
    getById: vi.fn().mockResolvedValue(value),
    list: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn(),
  }) as unknown as SongRepository

describe('transposeSong', () => {
  it('updates currentKey and preserves originalKey and lyrics', async () => {
    const repository = repo(song())
    const result = await transposeSong({ id: 'song-1', semitones: 2 }, repository)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.song.currentKey).toBe('E')
      expect(result.song.originalKey).toBe('D')
      expect(result.song.lyrics).toBe('[D]Grandioso és [A]Tu')
    }
    expect(repository.update).toHaveBeenCalled()
  })

  it('accumulates currentKey only while keeping the original chord text unchanged', async () => {
    const storedSong = song()
    const repository = repo(storedSong)

    const first = await transposeSong({ id: 'song-1', semitones: 2 }, repository)
    if (!first.success) throw new Error('first transpose failed')

    const afterD = { ...first.song }
    const secondRepository = repo(afterD)
    const second = await transposeSong({ id: 'song-1', semitones: 2 }, secondRepository)

    expect(second.success).toBe(true)
    if (second.success) {
      expect(second.song.currentKey).toBe('F#')
      expect(second.song.originalKey).toBe('D')
      expect(second.song.lyrics).toBe(storedSong.lyrics)
    }

    const directRepository = repo(storedSong)
    const direct = await transposeSong({ id: 'song-1', semitones: 4 }, directRepository)

    expect(direct.success).toBe(true)
    if (direct.success && second.success) {
      expect(second.song.currentKey).toBe(direct.song.currentKey)
      expect(second.song.lyrics).toBe(direct.song.lyrics)
    }
  })

  it('returns to the original key without changing the original lyrics', async () => {
    const repository = repo(song())
    const first = await transposeSong({ id: 'song-1', semitones: 2 }, repository)
    if (!first.success) throw new Error('first transpose failed')

    const backRepository = repo(first.song)
    const back = await transposeSong({ id: 'song-1', semitones: -2 }, backRepository)

    expect(back.success).toBe(true)
    if (back.success) {
      expect(back.song.currentKey).toBe('D')
      expect(back.song.originalKey).toBe('D')
      expect(back.song.lyrics).toBe('[D]Grandioso és [A]Tu')
    }
  })

  it('returns an error for a missing song', async () => {
    const repository = repo(undefined)
    const result = await transposeSong({ id: 'missing', semitones: 1 }, repository)

    expect(result.success).toBe(false)
    expect(repository.update).not.toHaveBeenCalled()
  })
})
