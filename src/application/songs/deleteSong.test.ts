import { describe, expect, it, vi } from 'vitest'
import type { SongRepository } from '../../db/repositories/songRepository'
import { deleteSong } from './deleteSong'

function repositoryMock(songExists = true): SongRepository {
  return {
    getById: vi.fn().mockResolvedValue(
      songExists
        ? {
            id: 'song-1',
            title: 'Grandioso És Tu',
            originalKey: 'D',
            currentKey: 'D',
            lyrics: '[D]Grandioso és [A]Tu',
            bpm: 90,
            isFavorite: false,
            createdAt: '2026-08-20T10:00:00.000Z',
            updatedAt: '2026-08-22T10:00:00.000Z',
          }
        : undefined,
    ),
    list: vi.fn(),
    update: vi.fn(),
    remove: vi.fn().mockResolvedValue(undefined),
  } as unknown as SongRepository
}

describe('deleteSong', () => {
  it('deletes an existing song', async () => {
    const repository = repositoryMock()

    const result = await deleteSong('song-1', repository)

    expect(result.success).toBe(true)
    expect(repository.remove).toHaveBeenCalledWith('song-1')
  })

  it('returns failure and removes nothing when the song does not exist', async () => {
    const repository = repositoryMock(false)

    const result = await deleteSong('song-1', repository)

    expect(result.success).toBe(false)
    expect(repository.remove).not.toHaveBeenCalled()
  })
})
