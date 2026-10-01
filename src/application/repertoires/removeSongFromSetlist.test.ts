import { describe, expect, it, vi } from 'vitest'
import type { SetlistRepository } from '../../db/repositories/setlistRepository'
import type { SetlistSongRepository } from '../../db/repositories/setlistSongRepository'
import { removeSongFromSetlist } from './removeSongFromSetlist'

describe('removeSongFromSetlist', () => {
  it('removes the association and closes the position gap', async () => {
    const setlists = {
      getById: vi.fn().mockResolvedValue({ id: 'setlist-1', name: 'Culto', createdAt: '', updatedAt: '' }),
      update: vi.fn(),
    } as unknown as SetlistRepository
    const setlistSongs = {
      findBySetlistAndSong: vi.fn().mockResolvedValue({ id: 'e2', setlistId: 'setlist-1', songId: 'song-2', position: 1 }),
      listBySetlistId: vi.fn().mockResolvedValue([
        { id: 'e1', setlistId: 'setlist-1', songId: 'song-1', position: 0 },
        { id: 'e2', setlistId: 'setlist-1', songId: 'song-2', position: 1 },
        { id: 'e3', setlistId: 'setlist-1', songId: 'song-3', position: 2 },
      ]),
      remove: vi.fn(),
      update: vi.fn(),
    } as unknown as SetlistSongRepository

    const result = await removeSongFromSetlist('setlist-1', 'song-2', { setlists, setlistSongs })
    expect(result).toEqual({ success: true })
    expect(setlistSongs.remove).toHaveBeenCalledWith('e2')
    expect(setlistSongs.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'e3', position: 1 }))
  })
})
