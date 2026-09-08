import { describe, expect, it } from 'vitest'
import { hasSharedExecutionChanged, toSharedExecutionState } from './sharedExecution'

const baseState = {
  sessionId: 'session-1',
  revision: 4,
  currentIndex: 2,
  currentSongId: 'song-3',
  currentKey: 'G',
  isRunning: false,
  mdAnnotation: 'Entrar direto no refrão',
  updatedAt: '2026-09-08T22:00:00.000Z',
} as const

describe('shared execution', () => {
  it('maps session and stage state into one execution state', () => {
    expect(toSharedExecutionState(baseState, 'live')).toMatchObject({
      sessionId: 'session-1',
      revision: 4,
      currentIndex: 2,
      currentSongId: 'song-3',
      currentKey: 'G',
      isRunning: false,
      mdAnnotation: 'Entrar direto no refrão',
      status: 'paused',
    })
  })

  it('marks execution as running, lobby and ended from authoritative session state', () => {
    expect(toSharedExecutionState({ ...baseState, isRunning: true }, 'live').status).toBe('running')
    expect(toSharedExecutionState(baseState, 'lobby').status).toBe('lobby')
    expect(toSharedExecutionState({ ...baseState, isRunning: true }, 'ended').status).toBe('ended')
  })

  it('detects revisions and execution mutations as changes', () => {
    const current = toSharedExecutionState(baseState, 'live')
    expect(hasSharedExecutionChanged(current, current)).toBe(false)
    expect(hasSharedExecutionChanged(current, { ...current, revision: 5 })).toBe(true)
    expect(hasSharedExecutionChanged(current, { ...current, currentIndex: 3 })).toBe(true)
    expect(hasSharedExecutionChanged(current, { ...current, isRunning: true, status: 'running' })).toBe(true)
  })
})
