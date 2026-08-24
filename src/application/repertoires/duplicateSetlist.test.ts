import { describe, expect, it, vi } from 'vitest'
import type { SetlistRepository } from '../../db/repositories/setlistRepository'
import type { SetlistSongRepository } from '../../db/repositories/setlistSongRepository'
import { duplicateSetlist } from './duplicateSetlist'

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
    ]),
    findBySetlistAndSong: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  } as unknown as SetlistSongRepository
}

describe('duplicateSetlist', () => {
  it('creates a copy preserving the song order and song ids', async () => {
    const setlists = setlistRepositoryMock()
    const setlistSongs = setlistSongRepositoryMock()

    const result = await duplicateSetlist('setlist-1', { setlists, setlistSongs })

    expect(result.success).toBe(true)
    expect(setlists.create).toHaveBeenCalledTimes(1)
    expect(setlistSongs.create).toHaveBeenCalledTimes(2)

    if (result.success) {
      expect(result.setlist.name).toBe('Culto (cópia)')
      expect(result.setlist.id).not.toBe('setlist-1')
      expect(result.setlist.createdAt).toBe(result.setlist.updatedAt)

      const createdEntries = vi.mocked(setlistSongs.create).mock.calls.map(([entry]) => entry)
      expect(createdEntries).toEqual([
        expect.objectContaining({
          setlistId: result.setlist.id,
          songId: 'song-1',
          position: 0,
        }),
        expect.objectContaining({
          setlistId: result.setlist.id,
          songId: 'song-2',
          position: 1,
        }),
      ])
      expect(createdEntries[0]?.id).not.toBe('entry-1')
      expect(createdEntries[1]?.id).not.toBe('entry-2')
    }
  })

  it('does not create anything when the source setlist does not exist', async () => {
    const setlists = setlistRepositoryMock()
    vi.mocked(setlists.getById).mockResolvedValue(undefined)
    const setlistSongs = setlistSongRepositoryMock()

    const result = await duplicateSetlist('missing', { setlists, setlistSongs })

    expect(result).toEqual({ success: false, message: 'Repertório não encontrado.' })
    expect(setlists.create).not.toHaveBeenCalled()
    expect(setlistSongs.create).not.toHaveBeenCalled()
  })
})
