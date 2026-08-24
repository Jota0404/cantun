import { describe, expect, it } from 'vitest'
import { parseSongText } from './parseSongText'

describe('parseSongText', () => {
  it('parses the official txt format', () => {
    const result = parseSongText(`Título: Oceano\nArtista: Hillsong United\nTom: D\nBPM: 72\nNotas: Música para abertura\n\n[D]Tu és...\n[G]Minha esperança`)

    expect(result).toEqual({
      success: true,
      data: {
        title: 'Oceano',
        artist: 'Hillsong United',
        originalKey: 'D',
        currentKey: 'D',
        bpm: 72,
        lyrics: '[D]Tu és...\n[G]Minha esperança',
        notes: 'Música para abertura',
      },
    })
  })

  it('supports optional artist, bpm and notes', () => {
    const result = parseSongText('Título: Oceano\nTom: D\n\n[D]Tu és...')

    expect(result).toEqual({
      success: true,
      data: {
        title: 'Oceano',
        artist: undefined,
        originalKey: 'D',
        currentKey: 'D',
        bpm: undefined,
        lyrics: '[D]Tu és...',
        notes: undefined,
      },
    })
  })

  it('normalizes Windows line endings', () => {
    const result = parseSongText('Título: Oceano\r\nTom: D\r\n\r\n[D]Tu és...')

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.lyrics).toBe('[D]Tu és...')
  })

  it('rejects missing required data', () => {
    const result = parseSongText('Título: \nTom: H\n\n')

    expect(result).toEqual({
      success: false,
      errors: ['Título é obrigatório.', 'Tom inválido: H.', 'Cifra/letra é obrigatória.'],
    })
  })

  it('rejects an invalid bpm', () => {
    const result = parseSongText('Título: Oceano\nTom: D\nBPM: 1000\n\n[D]Tu és...')

    expect(result).toEqual({
      success: false,
      errors: ['BPM deve ser um número inteiro entre 1 e 999.'],
    })
  })
})
