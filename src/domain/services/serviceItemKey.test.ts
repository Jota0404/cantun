import { describe, expect, it } from 'vitest'
import { effectiveKey, validateServiceItemKey } from './serviceItem'

describe('service item key (RN-06…08)', () => {
  it('accepts a key of the same mode and refuses the other mode', () => {
    expect(validateServiceItemKey({ type: 'song' }, 'D', { originalKey: 'G' })).toEqual([])
    expect(validateServiceItemKey({ type: 'song' }, 'Em', { originalKey: 'Am' })).toEqual([])
    expect(validateServiceItemKey({ type: 'song' }, 'Am', { originalKey: 'C' })).toHaveLength(1)
    expect(validateServiceItemKey({ type: 'song' }, 'C', { originalKey: 'Am' })).toHaveLength(1)
  })

  it('refuses a key on a non-song item', () => {
    expect(validateServiceItemKey({ type: 'prayer' }, 'C', { originalKey: 'C' })).toHaveLength(1)
  })

  it('falls back to the song current key', () => {
    expect(effectiveKey({}, { currentKey: 'G' })).toBe('G')
    expect(effectiveKey({ key: 'A' }, { currentKey: 'G' })).toBe('A')
  })
})
