import { describe, expect, it } from 'vitest'
import type { ServiceStatus } from './service'
import { canDeleteService, canTransition, isFinalStatus } from './serviceLifecycle'
import { moveItem, renumber, validateServiceItem } from './serviceItem'

const ALL: ServiceStatus[] = ['draft', 'ready', 'in_progress', 'completed', 'cancelled']
const VALID = new Set(['draft>ready', 'draft>cancelled', 'ready>draft', 'ready>in_progress', 'ready>cancelled', 'in_progress>completed', 'in_progress>cancelled'])

describe('service lifecycle (RN-02)', () => {
  it('allows exactly the ADR-052 transitions', () => {
    for (const from of ALL) for (const to of ALL) expect(canTransition(from, to), `${from}>${to}`).toBe(VALID.has(`${from}>${to}`))
  })

  it('completed and cancelled are final; leader deletes only drafts (S7)', () => {
    expect(ALL.filter(isFinalStatus)).toEqual(['completed', 'cancelled'])
    expect(canDeleteService('draft', true, false)).toBe(true)
    expect(canDeleteService('ready', true, false)).toBe(false)
    expect(canDeleteService('ready', true, true)).toBe(true)
    expect(canDeleteService('draft', false, false)).toBe(false)
  })
})

describe('service item (RN-04, RN-05)', () => {
  it('requires a song only for song items and a title for the others', () => {
    expect(validateServiceItem({ type: 'song', songId: 's1' })).toEqual([])
    expect(validateServiceItem({ type: 'song' })).toEqual(['Escolha a música.'])
    expect(validateServiceItem({ type: 'prayer', title: ' Oração ' })).toEqual([])
    expect(validateServiceItem({ type: 'prayer', title: '  ' })).toEqual(['Informe um título de 1 a 120 caracteres.'])
    expect(validateServiceItem({ type: 'prayer', title: 'x', songId: 's1' })).toEqual(['Só itens de música têm música vinculada.'])
    expect(validateServiceItem({ type: 'other', title: 'x'.repeat(121) })).toHaveLength(1)
    expect(validateServiceItem({ type: 'other', title: 'x', durationMinutes: 601 })).toEqual(['A duração deve ser de 1 a 600 minutos.'])
    expect(validateServiceItem({ type: 'bogus' as never, title: 'x' })).toEqual(['Tipo de item inválido.'])
  })

  it('moves and renumbers mixed items contiguously, returning only changed ones', () => {
    const items = [{ id: 'a', position: 0 }, { id: 'b', position: 1 }, { id: 'c', position: 2 }]
    expect(moveItem(items, 'c', 0)).toEqual([{ id: 'c', position: 0 }, { id: 'a', position: 1 }, { id: 'b', position: 2 }])
    expect(moveItem(items, 'a', 99)).toEqual([{ id: 'b', position: 0 }, { id: 'c', position: 1 }, { id: 'a', position: 2 }])
    expect(moveItem(items, 'missing', 0)).toEqual([])
    expect(renumber([{ id: 'a', position: 0 }, { id: 'c', position: 2 }])).toEqual([{ id: 'c', position: 1 }])
  })
})
