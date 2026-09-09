import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BandStageRealtime, createBandStageEvent } from './bandStageRealtime'

function makeChannel() {
  const handlers = new Map<string, (payload: { payload: unknown }) => void>()
  let subscribeHandler: ((status: string, error?: Error) => void) | undefined
  const channel = {
    on: vi.fn((kind: string, config: { event: string }, handler: (payload: { payload: unknown }) => void) => {
      handlers.set(`${kind}:${config.event}`, handler)
      return channel
    }),
    subscribe: vi.fn((handler?: (status: string, error?: Error) => void) => {
      subscribeHandler = handler
      queueMicrotask(() => subscribeHandler?.('SUBSCRIBED'))
      return Promise.resolve('SUBSCRIBED')
    }),
    unsubscribe: vi.fn(async () => 'ok'),
    send: vi.fn(async () => 'ok'),
    track: vi.fn(async () => 'ok'),
    untrack: vi.fn(async () => 'ok'),
    presenceState: vi.fn(() => ({})),
    emitBroadcast: (payload: unknown) => handlers.get('broadcast:*')?.({ payload }),
  }
  return channel
}

function makeClient() {
  const channel = makeChannel()
  const snapshot = {
    session: { id: 's1', band_id: 'b1', setlist_id: 'sl1', md_user_id: 'md1', status: 'live', created_at: '2026-09-08T00:00:00Z', started_at: '2026-09-08T00:00:01Z', ended_at: null, updated_at: '2026-09-08T00:00:02Z' },
    state: { session_id: 's1', revision: 7, current_index: 0, current_song_id: null, current_key: null, is_running: false, updated_at: '2026-09-08T00:00:02Z' },
  }
  return {
    channel: vi.fn(() => channel),
    rpc: vi.fn(async () => ({ data: [{ session: snapshot.session, state: snapshot.state }], error: null })),
  }
}

describe('BandStageRealtime event contract', () => {
  it('accepts preparation lifecycle events as valid stage events', async () => {
    const client = makeClient()
    const onEvent = vi.fn()
    const realtime = new BandStageRealtime({
      client: client as unknown as SupabaseClient,
      sessionId: 's1',
      onEvent,
    })

    await realtime.connect()
    client.channel().emitBroadcast?.(createBandStageEvent({
      type: 'stage.prepare-next',
      sessionId: 's1',
      revision: 8,
      actorUserId: 'md1',
      payload: { preparedIndex: 1, preparedSongId: 'song-2' },
    }))

    await Promise.resolve()
    expect(onEvent).toHaveBeenCalledTimes(1)
  })

  it('publishes and accepts cleared preparation events through the existing channel', async () => {
    const client = makeClient()
    const onEvent = vi.fn()
    const realtime = new BandStageRealtime({
      client: client as unknown as SupabaseClient,
      sessionId: 's1',
      onEvent,
    })

    await realtime.connect()
    const event = createBandStageEvent({
      type: 'stage.clear-prepared',
      sessionId: 's1',
      revision: 8,
      actorUserId: 'md1',
      payload: { preparedIndex: null, preparedSongId: null },
    })

    await realtime.publish(event)
    expect(client.channel().send).toHaveBeenCalledWith({ type: 'broadcast', event: 'stage.clear-prepared', payload: event })
  })
})
