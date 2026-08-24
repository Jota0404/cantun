import { describe, expect, it } from 'vitest'
import { getSemitoneDistance, transposeChord, transposeKey, transposeSongLyrics } from './transpose'

describe('transpose', () => {
  it('calculates semitone distance', () => { expect(getSemitoneDistance('C','E')).toBe(4); expect(getSemitoneDistance('E','C')).toBe(8) })
  it('preserves accidental preference', () => { expect(transposeKey('C',1)).toBe('C#'); expect(transposeKey('Db',2)).toBe('Eb'); expect(transposeKey('Bb',-1)).toBe('A') })
  it('transposes chord roots and slash basses', () => { expect(transposeChord('Cadd9/G',2,'D')).toBe('Dadd9/A'); expect(transposeChord('Am',2,'D')).toBe('Bm') })
  it('transposes only bracketed chords', () => { expect(transposeSongLyrics('[C]Santo\n[G]Tu és [Am]meu Senhor\nJesus é fiel',2,'D')).toBe('[D]Santo\n[A]Tu és [Bm]meu Senhor\nJesus é fiel') })
  it('uses flat spelling for flat target keys', () => { expect(transposeSongLyrics('[C]Santo [G]Senhor',1,'Db')).toBe('[Db]Santo [Ab]Senhor') })
})
