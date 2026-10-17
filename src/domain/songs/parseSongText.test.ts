import { describe, expect, it } from 'vitest'
import { normalizeMusicalKey, parseSongDraft, parseSongText } from './parseSongText'

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

  it('parses a common chord-sheet layout with title and artist on the first lines', () => {
    const result = parseSongText(`Santo Espírito\nLaura Souguellis\n\nTom: D\n\n[Refrão]\nD9\nSanto Espírito, és bem-vindo aqui\nG5(7M)\nVem inundar, encher esse lugar`)

    expect(result).toEqual({
      success: true,
      data: {
        title: 'Santo Espírito',
        artist: 'Laura Souguellis',
        originalKey: 'D',
        currentKey: 'D',
        bpm: undefined,
        lyrics: '[Refrão]\n[D9]\nSanto Espírito, és bem-vindo aqui\n[G5(7M)]\nVem inundar, encher esse lugar',
        notes: undefined,
      },
    })
  })

  it('normalizes chord-sheet exported prefixes', () => {
    const result = parseSongText('Santo Espírito\nLaura Souguellis\n\nTom: D\n\n">D9\nSanto Espírito, és bem-vindo aqui\n    G5(7M)')

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.lyrics).toBe('[D9]\nSanto Espírito, és bem-vindo aqui\n[G5(7M)]')
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

describe('parseSongDraft (RN-A4/A5)', () => {
  it('accepts labels in any case and accent, and aliases', () => {
    for (const header of ['Tom: D', 'tom: d', 'TOM: D', 'Key: d']) {
      const result = parseSongDraft(`Titulo: Oceano\n${header}\n\n[D]Tu és...`)
      expect(result).toMatchObject({ success: true, data: { title: 'Oceano', originalKey: 'D', currentKey: 'D' } })
    }
    const result = parseSongDraft('TÍTULO: Oceano\nArtist: Hillsong\nBPM: 72\nObservações: abertura\n\n[D]Tu és...')
    expect(result).toMatchObject({ success: true, data: { title: 'Oceano', artist: 'Hillsong', bpm: 72, notes: 'abertura', originalKey: undefined } })
  })

  it('normalizes the key value case and accidentals', () => {
    expect(['d', 'f#', 'bb', 'Bb', 'B', 'b', 'c♯', 'e♭'].map((value) => normalizeMusicalKey(value))).toEqual(['D', 'F#', 'Bb', 'Bb', 'B', 'B', 'C#', 'Eb'])
    expect(['Am', 'am', 'f#m', 'Bbm', 'e♭m'].map((value) => normalizeMusicalKey(value))).toEqual(['Am', 'Am', 'F#m', 'Bbm', 'Ebm'])
    expect(['H', '', 'E#', 'x', 'AM', 'Amm'].map((value) => normalizeMusicalKey(value))).toEqual([undefined, undefined, undefined, undefined, undefined, undefined])
  })

  it('returns a partial draft when the key is missing or invalid, instead of failing', () => {
    expect(parseSongDraft('Título: Oceano\n\n[D]Tu és...')).toMatchObject({ success: true, data: { originalKey: undefined, rawKey: undefined } })
    expect(parseSongDraft('Título: Oceano\nTom: H\n\n[D]Tu és...')).toMatchObject({ success: true, data: { originalKey: undefined, rawKey: 'H' } })
    expect(parseSongDraft('Título: Oceano\nTom: f#m\n\n[D]Tu és...')).toMatchObject({ success: true, data: { originalKey: 'F#m', currentKey: 'F#m', rawKey: undefined } })
  })

  it('still rejects missing title, lyrics or a bad bpm', () => {
    expect(parseSongDraft('Título: \nTom: D\n\n')).toEqual({ success: false, errors: ['Título é obrigatório.', 'Cifra/letra é obrigatória.'] })
  })

  it('strict parseSongText accepts lowercase keys and keeps rejecting a missing one', () => {
    expect(parseSongText('Título: A\ntom: bb\n\n[Bb]x')).toMatchObject({ success: true, data: { originalKey: 'Bb' } })
    expect(parseSongText('Título: A\nTom: Am\n\n[Am]x')).toMatchObject({ success: true, data: { originalKey: 'Am' } })
    expect(parseSongText('Título: A\nTom: H\n\n[Am]x')).toEqual({ success: false, errors: ['Tom inválido: H.'] })
  })
})
