import { describe, expect, it } from 'vitest'
import { getStageSongs } from './getStageSongs'
import type { SetlistSong } from '../../domain/repertoires/setlistSong'
import type { Song } from '../../domain/songs/song'
import type { SetlistSongRepository } from '../../db/repositories/setlistSongRepository'
import type { SongRepository } from '../../db/repositories/songRepository'

const songA: Song = {
  id: 'song-a',
  title: 'Primeira',
  originalKey: 'C',
  currentKey: 'C',
  lyrics: '[C]Primeira',
  isFavorite: false,
  createdAt: '2026-08-23T00:00:00.000Z',
  updatedAt: '2026-08-23T00:00:00.000Z',
}

const songB: Song = {
  id: 'song-b',
  title: 'Segunda',
  originalKey: 'D',
  currentKey: 'E',
  lyrics: '[D]Segunda',
  isFavorite: false,
  createdAt: '2026-08-23T00:00:00.000Z',
  updatedAt: '2026-08-23T00:00:00.000Z',
}

const entries: SetlistSong[] = [
  { id: 'entry-2', setlistId: 'setlist-1', songId: 'song-b', position: 2 },
  { id: 'entry-1', setlistId: 'setlist-1', songId: 'song-a', position: 1 },
]

describe('getStageSongs', () => {
  it('returns songs in repertoire order', async () => {
    const setlistSongs: Pick<SetlistSongRepository, 'listBySetlistId'> = {
      listBySetlistId: async () => [entries[1], entries[0]],
    }
    const songs: Pick<SongRepository, 'list'> = {
      list: async () => [songB, songA],
    }

    const result = await getStageSongs('setlist-1', {
      setlistSongs: setlistSongs as SetlistSongRepository,
      songs: songs as SongRepository,
    })

    expect(result.map(({ song }) => song.id)).toEqual(['song-a', 'song-b'])
  })

  it('ignores repertoire entries whose songs no longer exist', async () => {
    const setlistSongs: Pick<SetlistSongRepository, 'listBySetlistId'> = {
      listBySetlistId: async () => [entries[0], { ...entries[1], songId: 'missing' }],
    }
    const songs: Pick<SongRepository, 'list'> = {
      list: async () => [songA],
    }

    const result = await getStageSongs('setlist-1', {
      setlistSongs: setlistSongs as SetlistSongRepository,
      songs: songs as SongRepository,
    })

    expect(result).toHaveLength(1)
    expect(result[0].song.id).toBe('song-a')
  })
})
