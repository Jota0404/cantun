import { describe, expect, it, vi } from 'vitest'
import type { Song } from '../../domain/songs/song'
import type { SongRepository } from '../../db/repositories/songRepository'
import { updateSong, type UpdateSongInput } from './updateSong'

function validInput(
  overrides: Partial<UpdateSongInput> = {},
): UpdateSongInput {
  return {
    id: 'song-1',
    title: 'Grandioso És Tu',
    originalKey: 'D',
    currentKey: 'D',
    artist: 'Harpa Cristã',
    lyrics: '[D]Grandioso és [A]Tu',
    bpm: 90,
    notes: 'Introdução suave',
    ...overrides,
  }
}

function existingSong(overrides: Partial<Song> = {}): Song {
  return {
    id: 'song-1',
    title: 'Música antiga',
    originalKey: 'C',
    currentKey: 'C',
    lyrics: '[C]Letra antiga',
    bpm: 80,
    isFavorite: true,
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-22T10:00:00.000Z',
    ...overrides,
  }
}

function repositoryMock(
  song: Song | undefined = existingSong(),
): SongRepository {
  return {
    getById: vi.fn().mockResolvedValue(song),
    list: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn(),
  } as unknown as SongRepository
}

describe('updateSong', () => {
  it('updates an existing song', async () => {
    const repository = repositoryMock()
    const input = validInput()

    const result = await updateSong(input, repository)

    expect(result.success).toBe(true)

    if (!result.success) {
      throw new Error('Expected successful update')
    }

    expect(result.song.id).toBe('song-1')
    expect(result.song.title).toBe('Grandioso És Tu')
    expect(result.song.currentKey).toBe('D')
    expect(result.song.artist).toBe('Harpa Cristã')
    expect(result.song.lyrics).toBe('[D]Grandioso és [A]Tu')
    expect(result.song.bpm).toBe(90)
    expect(result.song.notes).toBe('Introdução suave')
  })

  it('preserves identity and creation metadata', async () => {
    const repository = repositoryMock(
      existingSong({
        id: 'song-original',
        createdAt: '2026-08-01T10:00:00.000Z',
        isFavorite: true,
      }),
    )

    const input = validInput({
      id: 'song-original',            
    })

    const result = await updateSong(input, repository)

    expect(result.success).toBe(true)

    if (!result.success) {
      throw new Error('Expected successful update')
    }

    expect(result.song.id).toBe('song-original')
    expect(result.song.createdAt).toBe('2026-08-01T10:00:00.000Z')
    expect(result.song.isFavorite).toBe(true)
  })

  it('updates updatedAt', async () => {
    const repository = repositoryMock()

    const result = await updateSong(validInput(), repository)

    expect(result.success).toBe(true)

    if (!result.success) {
      throw new Error('Expected successful update')
    }

    expect(result.song.updatedAt).not.toBe('2026-08-22T10:00:00.000Z')
    expect(() => new Date(result.song.updatedAt).toISOString()).not.toThrow()
  })

  it('persists the updated song through the repository', async () => {
    const repository = repositoryMock()

    const result = await updateSong(validInput(), repository)

    expect(result.success).toBe(true)
    expect(repository.update).toHaveBeenCalledTimes(1)
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'song-1',
        title: 'Grandioso És Tu',
      }),
    )
  })

  it('does not persist when validation fails', async () => {
    const repository = repositoryMock()

    const result = await updateSong(
      validInput({
        title: '',
        lyrics: '',
        bpm: 0,
      }),
      repository,
    )

    expect(result.success).toBe(false)
    expect(repository.update).not.toHaveBeenCalled()

    if (result.success) {
      throw new Error('Expected validation failure')
    }

    expect(result.errors.map((error) => error.field).sort()).toEqual([
      'bpm',
      'lyrics',
      'title',
    ])
  })

  it('returns failure when the song does not exist', async () => {
    const repository = repositoryMock()
    vi.mocked(repository.getById).mockResolvedValue(undefined)

    const result = await updateSong(validInput(), repository)

    expect(result.success).toBe(false)
    expect(repository.update).not.toHaveBeenCalled()

    if (result.success) {
      throw new Error('Expected not-found failure')
    }

    expect(result.errors).toContainEqual({
      field: 'title',
      message: 'Música não encontrada.',
    })
  })
})
