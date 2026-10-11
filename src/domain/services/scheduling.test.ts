import { describe, expect, it } from 'vitest'
import type { Assignment, AssignmentStatus } from './assignment'
import { availableAssignmentActions, canAssignmentTransition } from './assignmentLifecycle'
import { availabilityDate, validateAvailability } from './memberAvailability'
import { positionGap, serviceGaps } from './positionGap'
import { validatePosition, type ServicePosition } from './servicePosition'
import { suggestMembers } from './suggestMembers'

const ALL: AssignmentStatus[] = ['invited', 'confirmed', 'declined', 'replacement_needed', 'cancelled']
const VALID = new Set(['invited>confirmed', 'invited>declined', 'invited>cancelled', 'confirmed>replacement_needed', 'confirmed>cancelled', 'replacement_needed>cancelled'])
const position: ServicePosition = { id: 'p1', serviceId: 's1', musicalFunction: 'vocals', quantity: 2, createdAt: '', updatedAt: '' }
const a = (status: AssignmentStatus, userId = 'u'): Pick<Assignment, 'positionId' | 'status' | 'userId'> => ({ positionId: 'p1', status, userId })

describe('assignment lifecycle (RN-03..RN-05)', () => {
  it('allows exactly the ADR-053 transitions; declined and cancelled are final', () => {
    for (const from of ALL) for (const to of ALL) expect(canAssignmentTransition(from, to), `${from}>${to}`).toBe(VALID.has(`${from}>${to}`))
  })

  it('only the holder confirms or declines; managers replace and cancel; nothing on final services', () => {
    const invited = { status: 'invited', userId: 'me' } as const
    expect(availableAssignmentActions(invited, 'me', false, false)).toEqual(['confirm', 'decline'])
    expect(availableAssignmentActions(invited, 'leader', true, false)).toEqual(['cancel', 'resend_invite'])
    expect(availableAssignmentActions({ status: 'confirmed', userId: 'me' }, 'me', false, false)).toEqual(['request_replacement'])
    expect(availableAssignmentActions({ status: 'confirmed', userId: 'me' }, 'leader', true, false)).toEqual(['request_replacement', 'cancel'])
    expect(availableAssignmentActions({ status: 'replacement_needed', userId: 'me' }, 'leader', true, false)).toEqual(['replace', 'cancel'])
    expect(availableAssignmentActions({ status: 'declined', userId: 'me' }, 'leader', true, false)).toEqual([])
    expect(availableAssignmentActions(invited, 'me', true, true)).toEqual([])
  })
})

describe('position gaps (RN-06, RN-09)', () => {
  it('derives open/filled; invited and confirmed count, replacement_needed does not fill', () => {
    expect(positionGap(position, [a('confirmed'), a('invited')])).toMatchObject({ confirmed: 1, invited: 1, missing: 1, uninvited: 0, state: 'open' })
    expect(positionGap(position, [a('confirmed'), a('confirmed'), a('cancelled')])).toMatchObject({ missing: 0, state: 'filled' })
    expect(positionGap(position, [a('confirmed'), a('replacement_needed')])).toMatchObject({ confirmed: 1, missing: 1, uninvited: 1, state: 'open' })
    expect(serviceGaps([position, { ...position, id: 'p2', quantity: 1 }], [a('confirmed'), a('confirmed')])).toMatchObject({ openCount: 1, missingTotal: 1 })
  })

  it('validates quantity 1–20, function and notes', () => {
    expect(validatePosition({ musicalFunction: 'vocals', quantity: 1 })).toEqual([])
    expect(validatePosition({ musicalFunction: 'kazoo', quantity: 0, notes: 'x'.repeat(501) })).toHaveLength(3)
    expect(validatePosition({ musicalFunction: 'bass', quantity: 21 })).toEqual(['A quantidade deve ser de 1 a 20.'])
  })
})

describe('availability (RN-10)', () => {
  it('validates date, status and note', () => {
    expect(validateAvailability({ date: '2026-10-11', status: 'tentative', note: 'x' })).toEqual([])
    expect(validateAvailability({ date: '11/10', status: 'bogus' as never, note: 'x'.repeat(201) })).toHaveLength(3)
    expect(availabilityDate(new Date(2026, 9, 5, 23, 30).toISOString())).toBe('2026-10-05')
  })
})

describe('suggestMembers (RN-12)', () => {
  const candidates = ['ana', 'bia', 'caio', 'davi', 'eli', 'fabi'].map((userId) => ({ userId, functions: userId === 'eli' ? ['drums'] : ['vocals'] }))

  it('excludes holders and decliners, orders by function and availability, flags unavailable and busy', () => {
    const result = suggestMembers({
      candidates, musicalFunction: 'vocals',
      positionAssignments: [{ userId: 'ana', status: 'invited' }, { userId: 'bia', status: 'declined' }, { userId: 'fabi', status: 'cancelled' }],
      availabilityByUser: { caio: 'tentative', davi: 'unavailable', fabi: 'available' },
      busyUserIds: new Set(['caio']),
    })
    expect(result.map((s) => s.userId)).toEqual(['fabi', 'caio', 'eli', 'davi'])
    expect(result.find((s) => s.userId === 'davi')?.warnings).toEqual(['unavailable'])
    expect(result.find((s) => s.userId === 'caio')?.warnings).toEqual(['busy'])
    expect(result.find((s) => s.userId === 'eli')?.hasFunction).toBe(false)
  })
})
