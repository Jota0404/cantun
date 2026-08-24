import { describe, expect, it, vi } from 'vitest'
import type { Song } from '../../domain/songs/song'
import type { SongRepository } from '../../db/repositories/songRepository'
import { transposeSong } from './transposeSong'

const song = (overrides: Partial<Song> = {}): Song => ({ id:'song-1', title:'Grandioso És Tu', originalKey:'D', currentKey:'D', lyrics:'[D]Grandioso és [A]Tu', bpm:90, isFavorite:false, createdAt:'2026-08-20T10:00:00.000Z', updatedAt:'2026-08-22T10:00:00.000Z', ...overrides })
const repo = (value: Song | undefined): SongRepository => ({ getById: vi.fn().mockResolvedValue(value), list: vi.fn(), update: vi.fn().mockResolvedValue(undefined), remove: vi.fn() } as unknown as SongRepository)

describe('transposeSong', () => {
  it('updates currentKey and preserves originalKey and lyrics', async () => { const repository=repo(song()); const result=await transposeSong({id:'song-1',semitones:2},repository); expect(result.success).toBe(true); if(result.success){expect(result.song.currentKey).toBe('E'); expect(result.song.originalKey).toBe('D'); expect(result.song.lyrics).toBe('[D]Grandioso és [A]Tu')} expect(repository.update).toHaveBeenCalled() })
  it('returns an error for a missing song', async () => { const repository=repo(undefined); const result=await transposeSong({id:'missing',semitones:1},repository); expect(result.success).toBe(false); expect(repository.update).not.toHaveBeenCalled() })
})
