import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { SetlistSong } from '../../domain/repertoires/setlistSong'
import { SalmodiaDatabase } from '../database'
import { SetlistSongRepository } from './setlistSongRepository'

const db = new SalmodiaDatabase()
const repository = new SetlistSongRepository(db)

function buildEntry(overrides: Partial<SetlistSong> = {}): SetlistSong {
  return {
    id: 'entry-1',
    setlistId: 'setlist-1',
    songId: 'song-1',
    position: 0,
    updatedAt: '2026-08-24T10:00:00.000Z',
    ...overrides,
  }
}

describe('SetlistSongRepository', () => {
  beforeEach(async () => {
    await db.setlistSongs.clear()
  })

  it('lists songs in position order', async () => {
    await repository.create(buildEntry({ id: 'entry-2', songId: 'song-2', position: 1 }))
    await repository.create(buildEntry({ id: 'entry-1', position: 0 }))
    expect((await repository.listBySetlistId('setlist-1')).map((item) => item.songId)).toEqual([
      'song-1',
      'song-2',
    ])
  })

  it('finds a song association by setlist and song', async () => {
    const entry = buildEntry()
    await repository.create(entry)
    expect(await repository.findBySetlistAndSong('setlist-1', 'song-1')).toEqual(entry)
  })
})
