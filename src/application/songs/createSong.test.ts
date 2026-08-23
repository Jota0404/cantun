import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSong } from './createSong'
import type { CreateSongInput } from './createSong'
import { SongRepository } from '../../db/repositories/songRepository'

function validInput(overrides: Partial<CreateSongInput> = {}): CreateSongInput {
  return {
    title: 'Grande é o Senhor',
    artist: 'Diante do Trono',
    originalKey: 'C',
    currentKey: 'D',
    bpm: 80,
    lyrics: 'Grande é o Senhor, e mui digno de louvor...',
    notes: 'Tocar mais lento na introdução',
    ...overrides,
  }
}

describe('createSong', () => {
  let repository: SongRepository
  let createSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    repository = new SongRepository()
    createSpy = vi.spyOn(repository, 'create').mockResolvedValue(undefined)
  })

  it('creates a song from valid input', async () => {
    const result = await createSong(validInput(), repository)

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected success')

    expect(result.song.title).toBe('Grande é o Senhor')
    expect(result.song.artist).toBe('Diante do Trono')
    expect(result.song.originalKey).toBe('C')
    expect(result.song.currentKey).toBe('D')
    expect(result.song.bpm).toBe(80)
    expect(result.song.lyrics).toBe('Grande é o Senhor, e mui digno de louvor...')
    expect(result.song.notes).toBe('Tocar mais lento na introdução')
  })

  it('generates the application-managed fields', async () => {
    const result = await createSong(validInput(), repository)

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected success')

    expect(typeof result.song.id).toBe('string')
    expect(result.song.id.length).toBeGreaterThan(0)
    expect(result.song.isFavorite).toBe(false)
    expect(result.song.createdAt).toBe(result.song.updatedAt)
    expect(new Date(result.song.createdAt).toISOString()).toBe(result.song.createdAt)
  })

  it('persists the created song via the repository', async () => {
    const result = await createSong(validInput(), repository)

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected success')

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(createSpy).toHaveBeenCalledWith(result.song)
  })

  it('rejects invalid input and returns validation errors', async () => {
    const result = await createSong(validInput({ title: '' }), repository)

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')

    expect(result.errors.some((error) => error.field === 'title')).toBe(true)
  })

  it('does not persist when input is invalid', async () => {
    await createSong(validInput({ title: '' }), repository)

    expect(createSpy).not.toHaveBeenCalled()
  })
})