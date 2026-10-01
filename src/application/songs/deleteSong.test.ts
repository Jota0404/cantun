import { describe, expect, it, vi } from 'vitest'
import type { SongRepository } from '../../db/repositories/songRepository'
import type { SetlistSongRepository } from '../../db/repositories/setlistSongRepository'
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

function setlistSongRepositoryMock(
  relationships: Array<{ id: string; setlistId: string; songId: string; position: number }> = [],
): SetlistSongRepository {
  return {
    listBySongId: vi.fn().mockResolvedValue(relationships),
    remove: vi.fn().mockResolvedValue(undefined),
  } as unknown as SetlistSongRepository
}

describe('deleteSong', () => {
  it('deletes an existing song with no repertoire relationships', async () => {
    const repository = repositoryMock()
    const setlistSongs = setlistSongRepositoryMock()

    const result = await deleteSong('song-1', repository, setlistSongs)

    expect(result.success).toBe(true)
    expect(setlistSongs.listBySongId).toHaveBeenCalledWith('song-1')
    expect(setlistSongs.remove).not.toHaveBeenCalled()
    expect(repository.remove).toHaveBeenCalledWith('song-1')
  })

  it('removes a song relationship before deleting the song', async () => {
    const repository = repositoryMock()
    const setlistSongs = setlistSongRepositoryMock([
      { id: 'entry-1', setlistId: 'setlist-1', songId: 'song-1', position: 0 },
    ])

    const result = await deleteSong('song-1', repository, setlistSongs)

    expect(result.success).toBe(true)
    expect(setlistSongs.remove).toHaveBeenCalledWith('entry-1')
    expect(repository.remove).toHaveBeenCalledWith('song-1')
  })

  it('removes relationships from multiple repertoires', async () => {
    const repository = repositoryMock()
    const setlistSongs = setlistSongRepositoryMock([
      { id: 'entry-1', setlistId: 'setlist-1', songId: 'song-1', position: 0 },
      { id: 'entry-2', setlistId: 'setlist-2', songId: 'song-1', position: 2 },
    ])

    await deleteSong('song-1', repository, setlistSongs)

    expect(setlistSongs.remove).toHaveBeenCalledTimes(2)
    expect(setlistSongs.remove).toHaveBeenCalledWith('entry-1')
    expect(setlistSongs.remove).toHaveBeenCalledWith('entry-2')
  })

  it('returns failure and leaves relationships untouched when the song does not exist', async () => {
    const repository = repositoryMock(false)
    const setlistSongs = setlistSongRepositoryMock([
      { id: 'entry-1', setlistId: 'setlist-1', songId: 'song-1', position: 0 },
    ])

    const result = await deleteSong('song-1', repository, setlistSongs)

    expect(result.success).toBe(false)
    expect(setlistSongs.listBySongId).not.toHaveBeenCalled()
    expect(setlistSongs.remove).not.toHaveBeenCalled()
    expect(repository.remove).not.toHaveBeenCalled()
  })

  it('removes all relationships before removing the song', async () => {
    const repository = repositoryMock()
    const setlistSongs = setlistSongRepositoryMock([
      { id: 'entry-1', setlistId: 'setlist-1', songId: 'song-1', position: 0 },
      { id: 'entry-2', setlistId: 'setlist-2', songId: 'song-1', position: 1 },
    ])

    const order: string[] = []
    vi.mocked(setlistSongs.remove).mockImplementation(async () => {
      order.push('relationship')
    })
    vi.mocked(repository.remove).mockImplementation(async () => {
      order.push('song')
    })

    await deleteSong('song-1', repository, setlistSongs)

    expect(order).toEqual(['relationship', 'relationship', 'song'])
  })
})
