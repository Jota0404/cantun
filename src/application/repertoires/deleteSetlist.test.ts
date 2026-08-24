import { describe, expect, it, vi } from 'vitest'
import type { SetlistRepository } from '../../db/repositories/setlistRepository'
import type { SetlistSongRepository } from '../../db/repositories/setlistSongRepository'
import { deleteSetlist } from './deleteSetlist'

function setlistRepositoryMock() {
  return {
    getById: vi.fn().mockResolvedValue({
      id: 'setlist-1',
      name: 'Culto',
      createdAt: '',
      updatedAt: '',
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

describe('deleteSetlist', () => {
  it('removes the setlist and its song associations', async () => {
    const setlists = setlistRepositoryMock()
    const setlistSongs = setlistSongRepositoryMock()

    const result = await deleteSetlist('setlist-1', { setlists, setlistSongs })

    expect(result).toEqual({ success: true })
    expect(setlistSongs.remove).toHaveBeenCalledWith('entry-1')
    expect(setlistSongs.remove).toHaveBeenCalledWith('entry-2')
    expect(setlists.remove).toHaveBeenCalledWith('setlist-1')
  })

  it('does not remove anything when the setlist does not exist', async () => {
    const setlists = setlistRepositoryMock()
    vi.mocked(setlists.getById).mockResolvedValue(undefined)
    const setlistSongs = setlistSongRepositoryMock()

    const result = await deleteSetlist('missing', { setlists, setlistSongs })

    expect(result).toEqual({ success: false, message: 'Repertório não encontrado.' })
    expect(setlistSongs.remove).not.toHaveBeenCalled()
    expect(setlists.remove).not.toHaveBeenCalled()
  })
})
