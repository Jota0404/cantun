import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BandStageReconciler, BandStageRealtime, createBandStageEvent, bandStageChannelName } from './bandStageRealtime'

type FakeChannel = ReturnType<typeof makeChannel>
type FakeClient = {
  rpc: ReturnType<typeof vi.fn>
  channel: ReturnType<typeof vi.fn>
  channels: FakeChannel[]
}

const snapshot = (revision: number) => ({
  session: {
    id: 's1',
    bandId: 'b1',
    setlistId: 'sl1',
    mdUserId: 'md1',
    status: 'live' as const,
    createdAt: '2026-09-08T00:00:00Z',
    startedAt: '2026-09-08T00:00:01Z',
    updatedAt: '2026-09-08T00:00:02Z',
  },
  state: {
    sessionId: 's1',
    revision,
    currentIndex: revision,
    currentSongId: `song-${revision}`,
    currentKey: 'C',
    isRunning: true,
    updatedAt: '2026-09-08T00:00:02Z',
  },
})

function makeClient(revision = 7): FakeClient {
  const channels: FakeChannel[] = []
  const rpc = vi.fn(async () => ({
    data: [{ session: snapshot(revision).session, state: snapshot(revision).state }],
    error: null,
  }))
  const channel = vi.fn(() => {
    const value = makeChannel()
    channels.push(value)
    return value
  })
  return { rpc, channel, channels }
}

function makeChannel() {
  let callback: ((args: { payload: unknown }) => void) | undefined
  const value = {
    on: vi.fn((_kind: string, _config: unknown, handler: (args: { payload: unknown }) => void) => {
      callback = handler
      return value
    }),
    subscribe: vi.fn(async () => 'SUBSCRIBED'),
    unsubscribe: vi.fn(async () => 'ok'),
    send: vi.fn(async () => 'ok'),
    track: vi.fn(async () => 'ok'),
    presenceState: vi.fn(() => ({})),
    emit: (payload: unknown) => callback?.({ payload }),
  }
  return value
}

function createRealtime(client: FakeClient, onStatus?: (value: string) => void) {
  return new BandStageRealtime({ client: client as unknown as SupabaseClient, sessionId: 's1', onStatus })
}

describe('BandStageRealtime entry/reconnect', () => {
  it('subscribes to target StageSession state when a target session is provided', async () => {
    const client = makeClient(8)
    const realtime = new BandStageRealtime({
      client: client as unknown as SupabaseClient,
      sessionId: 's1',
      targetSessionId: 'ts1',
    })

    await realtime.connect()

    expect(client.channel).toHaveBeenCalledTimes(2)
    expect(client.channels[1].on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'UPDATE',
        schema: 'public',
        table: 'stage_session_states',
        filter: 'stage_session_id=eq.ts1',
      }),
      expect.any(Function),
    )
    expect(client.channels[1].subscribe).toHaveBeenCalledTimes(1)
  })

  it('subscribes to stage events on the target StageSession channel', async () => {
    const client = makeClient(8)
    const realtime = new BandStageRealtime({
      client: client as unknown as SupabaseClient,
      sessionId: 's1',
      targetSessionId: 'ts1',
    })

    await realtime.connect()

    expect(client.channels[1].on).toHaveBeenCalledWith(
      'broadcast',
      { event: '*' },
      expect.any(Function),
    )
  })

  it('subscribes before fetching the authoritative snapshot', async () => {
    const client = makeClient(7)
    const statuses: string[] = []
    const realtime = createRealtime(client, (value) => statuses.push(value))

    const result = await realtime.connect()

    expect(result.state.revision).toBe(7)
    expect(client.channel).toHaveBeenCalledWith(bandStageChannelName('s1'), expect.anything())
    expect(client.channels[0].subscribe).toHaveBeenCalledTimes(1)
    expect(client.rpc).toHaveBeenCalledTimes(1)
    expect(statuses).toEqual(['SUBSCRIBED'])
  })

  it('mirrors presence to the target StageSession channel', async () => {
    const client = makeClient(8)
    const realtime = new BandStageRealtime({
      client: client as unknown as SupabaseClient,
      sessionId: 's1',
      targetSessionId: 'ts1',
      onPresence: vi.fn(),
    })

    await realtime.connect()
    await realtime.trackPresence({
      userId: 'u1',
      displayName: 'Músico',
      musicalRole: 'vocals',
      isMd: false,
      readiness: 'ready',
    })

    expect(client.channels[0].track).toHaveBeenCalledTimes(1)
    expect(client.channels[1].track).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1',
      readiness: 'ready',
    }))
  })

  it('falls back to legacy presence when target presence fails', async () => {
    const client = makeClient(8)
    const realtime = new BandStageRealtime({
      client: client as unknown as SupabaseClient,
      sessionId: 's1',
      targetSessionId: 'ts1',
    })

    await realtime.connect()
    client.channels[1].track.mockRejectedValueOnce(new Error('target unavailable'))

    await realtime.trackPresence({
      userId: 'u1',
      displayName: 'Músico',
      musicalRole: 'vocals',
      isMd: false,
      readiness: 'ready',
    })

    expect(client.channels[0].track).toHaveBeenCalled()
  })

  it('mirrors stage events to the target StageSession channel', async () => {
    const client = makeClient(8)
    const realtime = new BandStageRealtime({
      client: client as unknown as SupabaseClient,
      sessionId: 's1',
      targetSessionId: 'ts1',
    })

    await realtime.connect()
    const event = createBandStageEvent({ type: 'stage.next', sessionId: 's1', revision: 9, actorUserId: 'md1', payload: {} })
    await realtime.publish(event)

    expect(client.channels[0].send).toHaveBeenCalledWith(expect.objectContaining({ event: 'stage.next', payload: event }))
    expect(client.channels[1].send).toHaveBeenCalledWith(expect.objectContaining({ event: 'stage.next', payload: event }))
  })

  it('falls back to the legacy transport when target broadcast fails', async () => {
    const client = makeClient(8)
    const realtime = new BandStageRealtime({
      client: client as unknown as SupabaseClient,
      sessionId: 's1',
      targetSessionId: 'ts1',
    })

    await realtime.connect()
    client.channels[1].send.mockRejectedValueOnce(new Error('target unavailable'))

    const event = createBandStageEvent({ type: 'stage.next', sessionId: 's1', revision: 9, actorUserId: 'md1', payload: {} })
    await realtime.publish(event)

    expect(client.channels[0].send).toHaveBeenCalledWith(expect.objectContaining({ event: 'stage.next', payload: event }))
  })

  it('reconnects from a clean revision after a dropped connection', async () => {
    const client = makeClient(12)
    const realtime = createRealtime(client)
    const first = await realtime.connect()
    expect(first.state.revision).toBe(12)

    const second = await realtime.reconnect()
    expect(second.state.revision).toBe(12)
    expect(client.channels[0].unsubscribe).toHaveBeenCalledTimes(1)
    expect(client.channels[0].subscribe).toHaveBeenCalledTimes(2)
    expect(client.channel).toHaveBeenCalledTimes(1)
    expect(client.rpc).toHaveBeenCalledTimes(2)
  })
})

describe('BandStageReconciler late events', () => {
  it('does not regress after an event arrives after the initial snapshot', async () => {
    const client = makeClient(9)
    const events: string[] = []
    const reconciler = new BandStageReconciler({
      client: client as unknown as SupabaseClient,
      sessionId: 's1',
      onEvent: (event) => events.push(`${event.type}:${event.revision}`),
    })

    await reconciler.reconcile('initial')
    const event = createBandStageEvent({ type: 'stage.next', sessionId: 's1', revision: 10, actorUserId: 'md1', payload: {} })
    await reconciler.acceptEvent(event)

    expect(reconciler.revision).toBe(10)
    expect(events).toEqual(['stage.next:10'])
  })
})
