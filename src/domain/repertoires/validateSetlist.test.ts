import { describe, expect, it } from 'vitest'
import { validateSetlistName } from './validateSetlist'

describe('validateSetlistName', () => {
  it('requires a name', () => {
    expect(validateSetlistName('   ')).toEqual([
      { field: 'name', message: 'Nome do repertório é obrigatório.' },
    ])
  })

  it('accepts a non-empty name', () => {
    expect(validateSetlistName('Culto de domingo')).toEqual([])
  })
})
