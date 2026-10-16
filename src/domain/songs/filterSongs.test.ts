import { describe, expect, it } from 'vitest'
import { filterSongs } from './filterSongs'

const s = (id: string, title: string, artist?: string) => ({ id, title, artist, originalKey: 'G' as const, currentKey: 'G' as const, lyrics: '', isFavorite: false, createdAt: '', updatedAt: '' })
const songs = [s('1', 'Aliança', 'Davi Sacer'), s('2', 'Oceano', 'Hillsong United'), s('3', 'Grande é o Senhor')]

describe('filterSongs (RN-A2)', () => {
  it('matches title or artist ignoring case and accents, all terms, sorted', () => {
    expect(filterSongs(songs, 'alianca').map((x) => x.id)).toEqual(['1'])
    expect(filterSongs(songs, 'HILLSONG oce').map((x) => x.id)).toEqual(['2'])
    expect(filterSongs(songs, '').map((x) => x.id)).toEqual(['1', '3', '2'])
    expect(filterSongs(songs, 'senhor davi')).toEqual([])
  })

  it('excludes songs already in the order', () => {
    expect(filterSongs(songs, '', new Set(['1', '2'])).map((x) => x.id)).toEqual(['3'])
  })
})
