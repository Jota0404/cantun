import { describe, expect, it, vi } from 'vitest'
import type { SetlistRepository } from '../../db/repositories/setlistRepository'
import type { SetlistSongRepository } from '../../db/repositories/setlistSongRepository'
import { reorderSetlist } from './reorderSetlist'

function setlistRepositoryMock() {
  return {
    getById: vi.fn().mockResolvedValue({
      id: 'setlist-1',
      name: 'Culto',
      createdAt: '2026-08-24T10:00:00.000Z',
      updatedAt: '2026-08-24T10:00:00.000Z',
    }),
    create: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  } as unknown as SetlistRepository
}

function setlistSongRepositoryMock() {
  return {
    listBySetlistId: vi.fn().mockResolvedValue([
      { id: 'entry-1', setlistId: 'setlist-1', songId: 'song-1', position: 0 },
      { id: 'entry-2', setlistId: 'setlist-1', songId: 'song-2', position: 1 },
      { id: 'entry-3', setlistId: 'setlist-1', songId: 'song-3', position: 2 },
    ]),
    findBySetlistAndSong: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  } as unknown as SetlistSongRepository
}

describe('reorderSetlist', () => {
  it('moves a song and persists the new positions', async () => {
    const setlists = setlistRepositoryMock()
    const setlistSongs = setlistSongRepositoryMock()

    const result = await reorderSetlist('setlist-1', 0, 2, { setlists, setlistSongs })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.entries.map((entry) => entry.songId)).toEqual(['song-2', 'song-3', 'song-1'])
      expect(result.entries.map((entry) => entry.position)).toEqual([0, 1, 2])
    }

    expect(setlistSongs.update).toHaveBeenCalledTimes(3)
    expect(setlistSongs.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'entry-2', songId: 'song-2', position: 0 }),
    )
    expect(setlistSongs.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'entry-3', songId: 'song-3', position: 1 }),
    )
    expect(setlistSongs.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'entry-1', songId: 'song-1', position: 2 }),
    )
    expect(setlists.update).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid positions without changing anything', async () => {
    const setlists = setlistRepositoryMock()
    const setlistSongs = setlistSongRepositoryMock()

    const result = await reorderSetlist('setlist-1', 0, 3, { setlists, setlistSongs })

    expect(result).toEqual({ success: false, message: 'Posição de música inválida.' })
    expect(setlistSongs.update).not.toHaveBeenCalled()
    expect(setlists.update).not.toHaveBeenCalled()
  })

  it('returns not found when the setlist does not exist', async () => {
    const setlists = setlistRepositoryMock()
    vi.mocked(setlists.getById).mockResolvedValue(undefined)
    const setlistSongs = setlistSongRepositoryMock()

    const result = await reorderSetlist('missing', 0, 1, { setlists, setlistSongs })

    expect(result).toEqual({ success: false, message: 'Repertório não encontrado.' })
    expect(setlistSongs.listBySetlistId).not.toHaveBeenCalled()
  })
})
