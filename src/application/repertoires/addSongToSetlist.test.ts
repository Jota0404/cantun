import { describe, expect, it, vi } from 'vitest'

import type { SetlistRepository } from '../../db/repositories/setlistRepository'
import type { SetlistSongRepository } from '../../db/repositories/setlistSongRepository'
import type { SetlistSong } from '../../domain/repertoires/setlistSong'

import { addSongToSetlist } from './addSongToSetlist'

function deps(
  entries: SetlistSong[] = [],
): { setlists: SetlistRepository; setlistSongs: SetlistSongRepository } {
  return {
    setlists: {
      getById: vi.fn().mockResolvedValue({
        id: 'setlist-1',
        name: 'Culto',
        createdAt: '',
        updatedAt: '',
      }),
      update: vi.fn(),
    } as unknown as SetlistRepository,

    setlistSongs: {
      findBySetlistAndSong: vi.fn().mockResolvedValue(undefined),
      listBySetlistId: vi.fn().mockResolvedValue(entries),
      create: vi.fn(),
    } as unknown as SetlistSongRepository,
  }
}

describe('addSongToSetlist', () => {
  it('appends a song after the current last position', async () => {
    const dependencies = deps([
      {
        id: 'e1',
        setlistId: 'setlist-1',
        songId: 'song-1',
        position: 0,
      },
    ])

    const result = await addSongToSetlist(
      'setlist-1',
      'song-2',
      dependencies,
    )

    expect(result.success).toBe(true)

    expect(dependencies.setlistSongs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        setlistId: 'setlist-1',
        songId: 'song-2',
        position: 1,
      }),
    )
  })

  it('rejects a duplicate song', async () => {
    const dependencies = deps()

    vi.mocked(
      dependencies.setlistSongs.findBySetlistAndSong,
    ).mockResolvedValue({
      id: 'e1',
      setlistId: 'setlist-1',
      songId: 'song-1',
      position: 0,
    })

    const result = await addSongToSetlist(
      'setlist-1',
      'song-1',
      dependencies,
    )

    expect(result.success).toBe(false)
    expect(dependencies.setlistSongs.create).not.toHaveBeenCalled()
  })
})