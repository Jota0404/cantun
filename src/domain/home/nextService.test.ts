import { describe, expect, it } from 'vitest'
import { selectNextService } from './nextService'

const c = (id: string, startsAt: string, assignment: string, service = 'ready') => ({ id, assignment: { status: assignment as never }, service: { startsAt, status: service as never } })

describe('selectNextService (RN-13)', () => {
  it('picks the nearest, preferring in-progress and confirmed, ignoring declined/cancelled', () => {
    expect(selectNextService([])).toBeUndefined()
    expect(selectNextService([c('a', '2099-02-01', 'declined'), c('b', '2099-02-02', 'cancelled')])).toBeUndefined()
    expect(selectNextService([c('far', '2099-03-01', 'confirmed'), c('near', '2099-02-01', 'invited')])?.id).toBe('near')
    expect(selectNextService([c('inv', '2099-02-01', 'invited'), c('ok', '2099-02-01', 'confirmed')])?.id).toBe('ok')
    expect(selectNextService([c('soon', '2099-02-01', 'confirmed'), c('live', '2099-05-01', 'confirmed', 'in_progress')])?.id).toBe('live')
  })
})
