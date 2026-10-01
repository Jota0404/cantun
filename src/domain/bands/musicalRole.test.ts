import { describe, expect, it } from 'vitest'
import { MUSICAL_ROLE_LABELS, isMusicalRole, toMusicalRole } from './musicalRole'

describe('musicalRole', () => {
  it('accepts supported musical roles', () => {
    expect(isMusicalRole('drums')).toBe(true)
    expect(isMusicalRole('invalid')).toBe(false)
  })

  it('falls back safely for legacy or invalid values', () => {
    expect(toMusicalRole(undefined)).toBe('other')
    expect(toMusicalRole('bass')).toBe('bass')
  })

  it('provides a label for every role', () => {
    expect(Object.keys(MUSICAL_ROLE_LABELS)).toHaveLength(11)
  })
})
