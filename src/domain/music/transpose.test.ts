import { describe, expect, it } from 'vitest'
import {
  getSemitoneDistance,
  transposeChord,
  transposeKey,
  transposeSongLyrics,
} from './transpose'

describe('transpose', () => {
  it('calculates semitone distance', () => {
    expect(getSemitoneDistance('C', 'E')).toBe(4)
    expect(getSemitoneDistance('E', 'C')).toBe(8)
  })

  it('preserves accidental preference', () => {
    expect(transposeKey('C', 1)).toBe('C#')
    expect(transposeKey('Db', 2)).toBe('Eb')
    expect(transposeKey('Bb', -1)).toBe('A')
  })

  it('transposes supported chord qualities without changing their suffix', () => {
    const cases = [
      ['C', 'D'],
      ['Am', 'Bm'],
      ['C7', 'D7'],
      ['Cmaj7', 'Dmaj7'],
      ['Csus4', 'Dsus4'],
      ['Cadd9', 'Dadd9'],
      ['C9', 'D9'],
      ['C13', 'D13'],
      ['Cdim7', 'Ddim7'],
      ['Caug', 'Daug'],
      ['Cno3', 'Dno3'],
      ['CM7', 'DM7'],
      ['C°7', 'D°7'],
      ['Cø7', 'Dø7'],
      ['C7b5', 'D7b5'],
      ['Cmaj7#11', 'Dmaj7#11'],
    ] as const

    for (const [source, expected] of cases) {
      expect(transposeChord(source, 2, 'D')).toBe(expected)
    }
  })

  it('transposes negative intervals while preserving chord quality', () => {
    expect(transposeChord('Cmaj7', -2, 'C')).toBe('Bbmaj7')
    expect(transposeChord('Am', -2, 'C')).toBe('Gm')
    expect(transposeChord('G7b5', -2, 'C')).toBe('F7b5')
  })

  it('preserves slash-bass inversions', () => {
    expect(transposeChord('G/B', 2, 'D')).toBe('A/C#')
    expect(transposeChord('Cadd9/G', 2, 'D')).toBe('Dadd9/A')
    expect(transposeChord('Bbmaj7/D', -2, 'Bb')).toBe('Abmaj7/C')
  })

  it('preserves accidentals according to the target key spelling', () => {
    expect(transposeChord('C', 1, 'Db')).toBe('Db')
    expect(transposeChord('G', 1, 'Db')).toBe('Ab')
    expect(transposeChord('Bb', -1, 'A')).toBe('A')
    expect(transposeChord('F#', 1, 'Gb')).toBe('G')
  })

  it('supports negative and multi-octave transposition without changing lyrics', () => {
    const lyrics = '[D]Grandioso [A]és [Bm]Tu\nJesus é fiel'
    expect(transposeSongLyrics(lyrics, -2, 'C')).toBe(
      '[C]Grandioso [G]és [Am]Tu\nJesus é fiel',
    )
    expect(transposeSongLyrics(lyrics, 12, 'C')).toBe(lyrics)
  })

  it('transposes only valid bracketed chord tokens', () => {
    const lyrics = '[C]Santo\n[G]Tu és [Am]meu Senhor\nJesus é fiel [texto]'

    expect(transposeSongLyrics(lyrics, 2, 'D')).toBe(
      '[D]Santo\n[A]Tu és [Bm]meu Senhor\nJesus é fiel [texto]',
    )
  })

  it('preserves every line and non-chord content in a complete song', () => {
    const lyrics = [
      '[D]Grandioso [A]és [Bm]Tu',
      'Senhor, minha [G/B]rocha',
      '',
      '[Cadd9/G]Anotação: entrada suave',
      'Jesus é [A7]fiel',
    ].join('\n')

    expect(transposeSongLyrics(lyrics, 2, 'D')).toBe([
      '[E]Grandioso [B]és [C#m]Tu',
      'Senhor, minha [A/C#]rocha',
      '',
      '[Dadd9/A]Anotação: entrada suave',
      'Jesus é [B7]fiel',
    ].join('\n'))
  })

  it('does not accumulate when a displayed key changes', () => {
    const lyrics = '[C]Santo [Am]meu [G/B]Senhor'
    const d = transposeSongLyrics(lyrics, getSemitoneDistance('C', 'D'), 'D')
    const e = transposeSongLyrics(lyrics, getSemitoneDistance('C', 'E'), 'E')
    const dThenE = transposeSongLyrics(lyrics, getSemitoneDistance('C', 'E'), 'E')
    const backToC = transposeSongLyrics(lyrics, getSemitoneDistance('C', 'C'), 'C')

    expect(d).toBe('[D]Santo [Bm]meu [A/C#]Senhor')
    expect(dThenE).toBe(e)
    expect(backToC).toBe(lyrics)
  })

  it('returns to the original chord text after a 12-semitone round trip', () => {
    const lyrics = '[Db]Santo [Bbm]meu [Ab/C]Senhor'

    expect(transposeSongLyrics(lyrics, 12, 'Db')).toBe(lyrics)
    expect(transposeSongLyrics(lyrics, -12, 'Db')).toBe(lyrics)
  })

  it('derives displayed chords from original key for multiple target keys', () => {
    const lyrics = '[D]Grandioso [A]és [Bm]Tu'

    expect(transposeSongLyrics(lyrics, getSemitoneDistance('D', 'E'), 'E')).toBe(
      '[E]Grandioso [B]és [C#m]Tu',
    )
    expect(transposeSongLyrics(lyrics, getSemitoneDistance('D', 'F#'), 'F#')).toBe(
      '[F#]Grandioso [C#]és [D#m]Tu',
    )
    expect(transposeSongLyrics(lyrics, getSemitoneDistance('D', 'D'), 'D')).toBe(
      lyrics,
    )
  })
})
