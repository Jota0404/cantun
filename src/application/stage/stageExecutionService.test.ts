import { describe, expect, it, vi } from 'vitest'
import type { BandStageEvent, BandStageSnapshot } from '../../domain/stage/bandStage'
import { StageExecutionService } from './stageExecutionService'

const legacySnapshot: BandStageSnapshot = {
  session: {
    id: 'legacy-session',
    bandId: 'org-1',
    setlistId: 'repertoire-1',
    mdUserId: 'md-1',
    status: 'live',
    createdAt: '2026-09-20T00:00:00Z',
    startedAt: '2026-09-20T00:01:00Z',
    updatedAt: '2026-09-20T00:02:00Z',
  },
  state: {
    sessionId: 'legacy-session',
    revision: 4,
    currentIndex: 1,
    currentSongId: 'song-1',
    currentKey: 'C',
    isRunning: true,
    updatedAt: '2026-09-20T00:02:00Z',
  },
}

vi.mock('./stageSessionService', () => ({
  getStageSession: vi.fn(async () => ({
    id: 'target-session',
    serviceId: 'service-1',
    legacyBandStageSessionId: 'legacy-session',
    status: 'live',
    createdAt: '2026-09-20T00:00:00Z',
    updatedAt: '2026-09-20T00:02:00Z',
  })),
}))

describe('StageExecutionService target identity facade', () => {
  it('targetizes realtime snapshots before exposing them to the application', async () => {
    let callbacks: {
      onSnapshot?: (snapshot: BandStageSnapshot, reason: 'initial' | 'event' | 'reconnect' | 'revision-gap') => void
    } = {}

    const realtime = {
      connect: vi.fn(async () => {
        callbacks.onSnapshot?.(legacySnapshot, 'event')
        return legacySnapshot
      }),
      disconnect: vi.fn(async () => undefined),
    }

    const service = new StageExecutionService({
      client: {
        rpc: vi.fn(async () => ({ data: null, error: null })),
      },
      realtimeFactory: (_sessionId, _client, nextCallbacks) => {
        callbacks = nextCallbacks ?? {}
        return realtime as never
      },
    })

    const snapshots: BandStageSnapshot[] = []
    const result = await service.connect('target-session', {
      onSnapshot: (snapshot) => snapshots.push(snapshot),
    })

    expect(result.session.id).toBe('target-session')
    expect(result.state.sessionId).toBe('target-session')
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0].session.id).toBe('target-session')
    expect(snapshots[0].state.sessionId).toBe('target-session')
  })

  it('targetizes realtime event session identity before exposing it to the application', async () => {
    let callbacks: {
      onEvent?: (event: BandStageEvent) => void
    } = {}

    const realtime = {
      connect: vi.fn(async () => {
        callbacks.onEvent?.({
          type: 'stage.next',
          sessionId: 'legacy-session',
          revision: 5,
          actorUserId: 'md-1',
          eventId: 'event-1',
          sentAt: '2026-09-20T00:03:00Z',
          payload: {},
        })
        return legacySnapshot
      }),
      disconnect: vi.fn(async () => undefined),
    }

    const service = new StageExecutionService({
      client: {
        rpc: vi.fn(async () => ({ data: null, error: null })),
      },
      realtimeFactory: (_sessionId, _client, nextCallbacks) => {
        callbacks = nextCallbacks ?? {}
        return realtime as never
      },
    })

    const events: Array<{ sessionId: string }> = []
    await service.connect('target-session', {
      onEvent: (event) => events.push(event),
    })

    expect(events).toHaveLength(1)
    expect(events[0].sessionId).toBe('target-session')
  })
})
