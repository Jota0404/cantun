import { describe, expect, it } from 'vitest'
import { normalizeSongLyrics } from './normalizeSongLyrics'

describe('normalizeSongLyrics', () => {
  it('converts a legacy chord-only line to bracket notation', () => {
    expect(normalizeSongLyrics('C D Em')).toBe('[C] [D] [Em]')
  })

  it('converts legacy greater-than chord lines without preserving the marker', () => {
    expect(normalizeSongLyrics('>Em\n>Bm C')).toBe('[Em]\n[Bm] [C]')
  })

  it('converts section labels followed by chords', () => {
    expect(normalizeSongLyrics('Intro C D\nVerso: Em Bm')).toBe(
      'Intro [C] [D]\nVerso: [Em] [Bm]',
    )
  })

  it('does not alter ordinary lyric text that happens to contain chord-like words', () => {
    expect(normalizeSongLyrics('Estou preparando um caminho\nE cada vez mais diminuindo')).toBe(
      'Estou preparando um caminho\nE cada vez mais diminuindo',
    )
  })

  it('does not alter tablature', () => {
    const tab = 'E|----------------|\nB|----0-----------|\nG|--0---2---------|'
    expect(normalizeSongLyrics(tab)).toBe(tab)
  })

  it('preserves existing bracket notation', () => {
    const lyrics = '[C]Santo [G]és Tu\n[Am]Senhor'
    expect(normalizeSongLyrics(lyrics)).toBe(lyrics)
  })

  it('normalizes the real legacy pattern used by imported chord sheets', () => {
    const lyrics = [
      'Intro C D',
      '>Em',
      '  Bm C',
      '',
      'Tab - Intro',
      'E|----------------|',
      'B|------0---------|',
      '',
      'Primeira Parte',
      'Estou preparando um caminho',
      '>G',
      'Estou preparando um caminho',
      'Em C',
    ].join('\n')

    expect(normalizeSongLyrics(lyrics)).toBe([
      'Intro [C] [D]',
      '[Em]',
      '[Bm] [C]',
      '',
      'Tab - Intro',
      'E|----------------|',
      'B|------0---------|',
      '',
      'Primeira Parte',
      'Estou preparando um caminho',
      '[G]',
      'Estou preparando um caminho',
      '[Em] [C]',
    ].join('\n'))
  })
})
