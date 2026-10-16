import { describe, expect, it } from 'vitest'
import { decodeTextFile } from './decodeTextFile'

describe('decodeTextFile (RN-A5)', () => {
  it('decodes valid UTF-8 and drops the BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Título: Oração')])
    expect(decodeTextFile(bytes)).toBe('Título: Oração')
  })

  it('falls back to windows-1252 when UTF-8 is invalid, keeping accents', () => {
    // "Título: Coração" em windows-1252: í = 0xED, ç = 0xE7, ã = 0xE3
    const bytes = new Uint8Array([0x54, 0xed, 0x74, 0x75, 0x6c, 0x6f, 0x3a, 0x20, 0x43, 0x6f, 0x72, 0x61, 0xe7, 0xe3, 0x6f])
    expect(decodeTextFile(bytes)).toBe('Título: Coração')
  })
})
