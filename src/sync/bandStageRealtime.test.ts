import { describe, expect, it, vi } from 'vitest'
import { BandStageReconciler, createBandStageEvent } from './bandStageRealtime'
import type { BandStageRealtimeOptions } from './bandStageRealtime'

function makeClient(revision = 3) {
  return {
    rpc: vi.fn(async () => ({
      data: [{
        session: { id: 's1', band_id: 'b1', setlist_id: 'sl1', md_user_id: 'md1', status: 'live', created_at: '2026-09-08T00:00:00Z', started_at: '2026-09-08T00:00:01Z', ended_at: null, updated_at: '2026-09-08T00:00:02Z' },
        state: { session_id: 's1', revision, current_index: revision, current_song_id: null, current_key: null, is_running: false, updated_at: '2026-09-08T00:00:02Z' },
      }],
      error: null,
    })),
  } as never
}

function options(client = makeClient()): BandStageRealtimeOptions {
  return { client, sessionId: 's1' }
}

describe('BandStageReconciler', () => {
  it('ignores duplicate and stale events', async () => {
    const reconciler = new BandStageReconciler(options())
    await reconciler.reconcile('initial')

    const event = createBandStageEvent({ type: 'stage.play', sessionId: 's1', revision: 4, actorUserId: 'md1', payload: {} })
    expect(await reconciler.acceptEvent(event)).toBe('applied')
    expect(await reconciler.acceptEvent(event)).toBe('ignored')
    expect(await reconciler.acceptEvent({ ...event, eventId: 'other', revision: 3 })).toBe('ignored')
    expect(reconciler.revision).toBe(4)
  })

  it('fetches a snapshot when a revision gap is detected', async () => {
    const client = makeClient(6)
    const callbacks = vi.fn()
    const reconciler = new BandStageReconciler({ ...options(client), onSnapshot: callbacks })
    await reconciler.reconcile('initial')

    const gap = createBandStageEvent({ type: 'stage.pause', sessionId: 's1', revision: 8, actorUserId: 'md1', payload: {} })
    const result = await reconciler.acceptEvent(gap)

    expect(result).toBe('reconciled')
    expect(client.rpc).toHaveBeenCalledTimes(2)
    expect(reconciler.revision).toBe(8)
  })
})
