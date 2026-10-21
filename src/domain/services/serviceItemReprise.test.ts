import { describe, expect, it } from 'vitest'
import { countDependents, repriseTitle, validateRepriseTarget, validateServiceItem } from './serviceItem'

describe('reprise and medley items (RN-10, RN-11)', () => {
  it('requires refItemId and a title, and forbids songId on reprise/medley', () => {
    expect(validateServiceItem({ type: 'reprise', title: 'Reprise: A', refItemId: 'i1' })).toEqual([])
    expect(validateServiceItem({ type: 'medley', title: 'Medley: A', refItemId: 'i1' })).toEqual([])
    expect(validateServiceItem({ type: 'reprise', title: 'Reprise: A' })).toHaveLength(1)
    expect(validateServiceItem({ type: 'reprise', title: 'Reprise: A', refItemId: 'i1', songId: 's' })).toHaveLength(1)
  })

  it('forbids refItemId on other types', () => {
    expect(validateServiceItem({ type: 'song', songId: 's', refItemId: 'i1' })).toHaveLength(1)
    expect(validateServiceItem({ type: 'prayer', title: 'Oração', refItemId: 'i1' })).toHaveLength(1)
  })

  it('accepts only a song of the same service as target', () => {
    const items = [
      { id: 'i1', serviceId: 's1', type: 'song' as const },
      { id: 'i2', serviceId: 's1', type: 'prayer' as const },
      { id: 'i3', serviceId: 's1', type: 'reprise' as const },
      { id: 'x1', serviceId: 's2', type: 'song' as const },
    ]
    expect(validateRepriseTarget('s1', 'i1', items)).toEqual([])
    for (const ref of ['i2', 'i3', 'x1', 'missing']) expect(validateRepriseTarget('s1', ref, items)).toHaveLength(1)
  })

  it('builds the title and counts dependents', () => {
    expect(repriseTitle('reprise', 'Grande é o Senhor')).toBe('Reprise: Grande é o Senhor')
    expect(repriseTitle('medley', 'x'.repeat(200))).toHaveLength(120)
    expect(countDependents([{ refItemId: 'i1' }, { refItemId: 'i1' }, { refItemId: 'i2' }, {}], 'i1')).toBe(2)
    expect(countDependents([], 'i1')).toBe(0)
  })
})
