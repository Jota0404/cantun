import { describe, expect, it, vi } from 'vitest'
import type { BandStageSnapshot } from '../../domain/stage/bandStage'
import { SharedExecutionService } from './sharedExecutionService'

const snapshot: BandStageSnapshot = {
  session: {
    id: 'target-session',
    bandId: 'org-1',
    setlistId: 'repertoire-1',
    mdUserId: 'md-1',
    status: 'live',
    createdAt: '2026-09-20T00:00:00Z',
    startedAt: '2026-09-20T00:01:00Z',
    updatedAt: '2026-09-20T00:02:00Z',
  },
  state: {
    sessionId: 'target-session',
    revision: 3,
    currentIndex: 1,
    currentSongId: 'song-1',
    currentKey: 'C',
    isRunning: true,
    updatedAt: '2026-09-20T00:02:00Z',
  },
}

describe('SharedExecutionService target execution port', () => {
  it('delegates commands without depending on the legacy service type', async () => {
    const execution = {
      play: vi.fn(async () => ({ state: snapshot.state, event: {} as never })),
      pause: vi.fn(async () => ({ state: snapshot.state, event: {} as never })),
      next: vi.fn(async () => ({ state: snapshot.state, event: {} as never })),
      previous: vi.fn(async () => ({ state: snapshot.state, event: {} as never })),
      goto: vi.fn(async () => ({ state: snapshot.state, event: {} as never })),
      setKey: vi.fn(async () => ({ state: snapshot.state, event: {} as never })),
      prepareNext: vi.fn(async () => ({ state: snapshot.state, event: {} as never })),
      clearPrepared: vi.fn(async () => ({ state: snapshot.state, event: {} as never })),
      endSession: vi.fn(async () => snapshot.session),
    }

    const service = new SharedExecutionService(execution)
    await service.next('target-session')
    await service.goto('target-session', 2, 'song-2')
    await service.end('target-session')

    expect(execution.next).toHaveBeenCalledWith('target-session')
    expect(execution.goto).toHaveBeenCalledWith('target-session', 2, 'song-2')
    expect(execution.endSession).toHaveBeenCalledWith('target-session')
  })

  it('keeps execution state keyed by the canonical StageSession identity', () => {
    const execution = {
      play: vi.fn(),
      pause: vi.fn(),
      next: vi.fn(),
      previous: vi.fn(),
      goto: vi.fn(),
      setKey: vi.fn(),
      prepareNext: vi.fn(),
      clearPrepared: vi.fn(),
      endSession: vi.fn(),
    }

    const service = new SharedExecutionService(execution)
    const state = service.applySnapshot(snapshot)

    expect(state.currentIndex).toBe(1)
    expect(service.get('target-session')).toBe(state)
    expect(service.get('legacy-session')).toBeUndefined()
  })
})
