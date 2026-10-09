import { describe, expect, it, vi } from 'vitest'
import type { StageSnapshot } from '../../domain/stage/stage'
import type { SharedExecutionPort } from './targetSharedExecutionService'
import { TargetSharedExecutionService } from './targetSharedExecutionService'

const snapshot = (
  revision: number,
  stateOverrides: Partial<StageSnapshot['state']> = {},
): StageSnapshot => ({
  session: {
    id: 'session-1', serviceId: 'service-1', mdUserId: 'md-1', status: 'live',
    createdAt: '2026-09-08T21:00:00.000Z', startedAt: '2026-09-08T21:01:00.000Z', updatedAt: '2026-09-08T22:00:00.000Z',
  },
  state: {
    stageSessionId: 'session-1', revision, currentIndex: 2, currentSongId: 'song-3', currentKey: 'G',
    isRunning: false, updatedAt: `2026-09-08T22:00:0${revision}.000Z`, ...stateOverrides,
  },
})

describe('TargetSharedExecutionService.applySnapshot', () => {
  const setup = () => {
    const service = new TargetSharedExecutionService({} as SharedExecutionPort)
    const listener = vi.fn()
    service.applySnapshot(snapshot(4))
    service.subscribe('session-1', listener)
    listener.mockClear()
    return { service, listener }
  }

  it('does not let an older revision overwrite current execution', () => {
    const { service, listener } = setup()

    const result = service.applySnapshot(snapshot(3, { currentIndex: 1 }))

    expect(result.revision).toBe(4)
    expect(result.currentIndex).toBe(2)
    expect(service.get('session-1')?.revision).toBe(4)
    expect(listener).not.toHaveBeenCalled()
  })

  it('does not let an equal revision with an older updatedAt overwrite current execution', () => {
    const { service, listener } = setup()

    const result = service.applySnapshot(snapshot(4, { currentIndex: 1, updatedAt: '2026-09-08T22:00:03.000Z' }))

    expect(result.currentIndex).toBe(2)
    expect(service.get('session-1')?.currentIndex).toBe(2)
    expect(listener).not.toHaveBeenCalled()
  })

  it('applies a newer revision and notifies subscribers', () => {
    const { service, listener } = setup()

    const result = service.applySnapshot(snapshot(5, { currentIndex: 3, isRunning: true }))

    expect(result).toMatchObject({ revision: 5, currentIndex: 3, status: 'running' })
    expect(service.get('session-1')).toBe(result)
    expect(listener).toHaveBeenCalledWith(result)
  })
})
