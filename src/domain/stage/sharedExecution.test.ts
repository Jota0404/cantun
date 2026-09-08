import { describe, expect, it, vi } from 'vitest'
import { SharedExecutionService } from '../../application/stage/sharedExecutionService'
import { toSharedExecutionState } from './sharedExecution'
import type { SharedExecutionState } from './sharedExecution'

const baseState: SharedExecutionState = {
  sessionId: 'session-1',
  revision: 4,
  currentIndex: 2,
  currentSongId: 'song-3',
  currentKey: 'G',
  isRunning: false,
  mdAnnotation: 'Entrar direto no refrão',
  updatedAt: '2026-09-08T22:00:00.000Z',
}

const snapshot = (revision: number, overrides: Partial<typeof baseState> = {}) => ({
  session: {
    id: 'session-1', bandId: 'band-1', setlistId: 'setlist-1', mdUserId: 'md-1', status: 'live' as const,
    createdAt: '2026-09-08T21:00:00.000Z', startedAt: '2026-09-08T21:01:00.000Z', updatedAt: '2026-09-08T22:00:00.000Z',
  },
  state: { ...baseState, revision, updatedAt: `2026-09-08T22:00:0${revision}.000Z`, ...overrides },
})

describe('shared execution', () => {
  it('maps session and stage state into one execution state', () => {
    expect(toSharedExecutionState(baseState, 'live')).toMatchObject({
      sessionId: 'session-1', revision: 4, currentIndex: 2, currentSongId: 'song-3', currentKey: 'G',
      isRunning: false, mdAnnotation: 'Entrar direto no refrão', status: 'paused',
    })
  })

  it('derives lifecycle status from authoritative session state', () => {
    expect(toSharedExecutionState({ ...baseState, isRunning: true }, 'live').status).toBe('running')
    expect(toSharedExecutionState(baseState, 'lobby').status).toBe('lobby')
    expect(toSharedExecutionState({ ...baseState, isRunning: true }, 'ended').status).toBe('ended')
  })

  it('does not let an older snapshot overwrite current execution', () => {
    const service = new SharedExecutionService({} as never)
    const listener = vi.fn()
    service.applySnapshot(snapshot(4))
    service.subscribe('session-1', listener)
    listener.mockClear()

    const current = service.applySnapshot(snapshot(3, { currentIndex: 1 }))

    expect(current.revision).toBe(4)
    expect(current.currentIndex).toBe(2)
    expect(listener).not.toHaveBeenCalled()
  })
})
