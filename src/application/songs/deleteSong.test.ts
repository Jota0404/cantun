import { describe, expect, it, vi } from 'vitest'
import type { SongRepository } from '../../db/repositories/songRepository'
import { deleteSong } from './deleteSong'

function repositoryMock(
  songExists = true,
): SongRepository {
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
    expect(repository.remove).toHaveBeenCalledTimes(1)
    expect(repository.remove).toHaveBeenCalledWith('song-1')
  })

  it('returns failure when the song does not exist', async () => {
    const repository = repositoryMock(false)

    const result = await deleteSong('song-1', repository)

    expect(result.success).toBe(false)
    expect(repository.remove).not.toHaveBeenCalled()

    if (result.success) {
      throw new Error('Expected not-found failure')
    }

    expect(result.error).toEqual({
      field: 'id',
      message: 'Música não encontrada.',
    })
  })

  it('checks whether the song exists before removing it', async () => {
    const repository = repositoryMock()

    await deleteSong('song-1', repository)

    expect(repository.getById).toHaveBeenCalledTimes(1)
    expect(repository.getById).toHaveBeenCalledWith('song-1')
    expect(repository.remove).toHaveBeenCalledTimes(1)
  })

  it('does not update or list songs', async () => {
    const repository = repositoryMock()

    await deleteSong('song-1', repository)

    expect(repository.update).not.toHaveBeenCalled()
    expect(repository.list).not.toHaveBeenCalled()
  })
})