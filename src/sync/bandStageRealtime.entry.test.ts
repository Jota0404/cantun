import { describe, expect, it, vi } from 'vitest'
import type { BandStageRealtimeOptions } from './bandStageRealtime'
import { BandStageReconciler, BandStageRealtime, createBandStageEvent, bandStageChannelName } from './bandStageRealtime'

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

function makeClient(revision = 7) {
  const channels: Array<ReturnType<typeof makeChannel>> = []
  return {
    rpc: vi.fn(async () => ({ data: [{ session: snapshot(revision).session, state: snapshot(revision).state }], error: null })),
    channel: vi.fn(() => {
      const channel = makeChannel()
      channels.push(channel)
      return channel
    }),
    channels,
  } as never
}

function makeChannel() {
  let callback: ((args: { payload: unknown }) => void) | undefined
  return {
    on: vi.fn((_kind: string, _config: unknown, handler: (args: { payload: unknown }) => void) => {
      callback = handler
      return this
    }),
    subscribe: vi.fn(async () => 'SUBSCRIBED'),
    unsubscribe: vi.fn(async () => 'ok'),
    send: vi.fn(async () => 'ok'),
    emit: (payload: unknown) => callback?.({ payload }),
  }
}

describe('BandStageRealtime entry/reconnect', () => {
  it('subscribes before fetching the authoritative snapshot', async () => {
    const client = makeClient(7)
    const statuses: string[] = []
    const realtime = new BandStageRealtime({
      client,
      sessionId: 's1',
      onStatus: (value) => statuses.push(value),
    })

    const result = await realtime.connect()

    expect(result.state.revision).toBe(7)
    expect(client.channel).toHaveBeenCalledWith(bandStageChannelName('s1'), expect.anything())
    expect(client.channels[0].subscribe).toHaveBeenCalledTimes(1)
    expect(client.rpc).toHaveBeenCalledTimes(1)
    expect(statuses).toEqual(['SUBSCRIBED'])
  })

  it('reconnects from a clean revision after a dropped connection', async () => {
    const client = makeClient(12)
    const realtime = new BandStageRealtime(client as unknown as BandStageRealtimeOptions['client'] extends never ? never : any)
    const first = await realtime.connect()
    expect(first.state.revision).toBe(12)

    const second = await realtime.reconnect()
    expect(second.state.revision).toBe(12)
    expect(client.channels[0].unsubscribe).toHaveBeenCalledTimes(1)
    expect(client.rpc).toHaveBeenCalledTimes(2)
  })
})

describe('BandStageReconciler late events', () => {
  it('does not regress after an event that arrives while the snapshot is being applied', async () => {
    const client = makeClient(9)
    const events: string[] = []
    const reconciler = new BandStageReconciler({
      client,
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
