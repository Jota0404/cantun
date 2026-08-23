import { describe, expect, it } from 'vitest'
import { isSongValid, validateSong } from './validateSong'
import type { SongValidationInput } from './validateSong'

function validSong(overrides: Partial<SongValidationInput> = {}): SongValidationInput {
  return {
    title: 'Grande é o Senhor',
    originalKey: 'C',
    currentKey: 'D',
    lyrics: '[C]Grande é o [G]Senhor',
    bpm: 90,
    ...overrides,
  }
}

describe('validateSong', () => {
  it('accepts a fully valid song', () => {
    expect(validateSong(validSong())).toEqual([])
    expect(isSongValid(validSong())).toBe(true)
  })

    it('accepts a valid song without bpm (optional)', () => {
    const song: SongValidationInput = {
      title: 'Grande é o Senhor',
      originalKey: 'C',
      currentKey: 'D',
      lyrics: '[C]Grande é o [G]Senhor',
    }
    expect(validateSong(song)).toEqual([])
  })

  it('requires title', () => {
    expect(validateSong(validSong({ title: '' }))).toContainEqual(
      expect.objectContaining({ field: 'title' })
    )
    expect(validateSong(validSong({ title: '   ' }))).toContainEqual(
      expect.objectContaining({ field: 'title' })
    )
  })

  it('requires originalKey', () => {
    const song = validSong({
      originalKey: undefined as unknown as SongValidationInput['originalKey'],
    })
    expect(validateSong(song)).toContainEqual(
      expect.objectContaining({ field: 'originalKey' })
    )
  })

  it('requires currentKey', () => {
    const song = validSong({
      currentKey: undefined as unknown as SongValidationInput['currentKey'],
    })
    expect(validateSong(song)).toContainEqual(
      expect.objectContaining({ field: 'currentKey' })
    )
  })

  it('requires lyrics', () => {
    expect(validateSong(validSong({ lyrics: '' }))).toContainEqual(
      expect.objectContaining({ field: 'lyrics' })
    )
    expect(validateSong(validSong({ lyrics: '   ' }))).toContainEqual(
      expect.objectContaining({ field: 'lyrics' })
    )
  })

  describe('bpm', () => {
    it('is optional', () => {
      const song = validSong({ bpm: undefined })
      expect(validateSong(song)).toEqual([])
    })

    it('rejects bpm below 1', () => {
      expect(validateSong(validSong({ bpm: 0 }))).toContainEqual(
        expect.objectContaining({ field: 'bpm' })
      )
    })

    it('rejects bpm above 999', () => {
      expect(validateSong(validSong({ bpm: 1000 }))).toContainEqual(
        expect.objectContaining({ field: 'bpm' })
      )
    })

    it('rejects non-integer bpm', () => {
      expect(validateSong(validSong({ bpm: 90.5 }))).toContainEqual(
        expect.objectContaining({ field: 'bpm' })
      )
    })

    it('accepts boundary values 1 and 999', () => {
      expect(validateSong(validSong({ bpm: 1 }))).toEqual([])
      expect(validateSong(validSong({ bpm: 999 }))).toEqual([])
    })
  })

  it('reports multiple errors at once', () => {
    const errors = validateSong(validSong({ title: '', lyrics: '', bpm: -5 }))
    expect(errors).toHaveLength(3)
    expect(errors.map((e) => e.field).sort()).toEqual(['bpm', 'lyrics', 'title'])
  })

  it('isSongValid mirrors validateSong', () => {
    expect(isSongValid(validSong({ title: '' }))).toBe(false)
  })
})