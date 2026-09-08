import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BandStageRealtime, createBandStageEvent } from './bandStageRealtime'

type Channel = ReturnType<typeof makeChannel>

type Client = {
  rpc: ReturnType<typeof vi.fn>
  channel: ReturnType<typeof vi.fn>
  channels: Channel[]
}

const snapshot = (revision: number) => ({
  session: {
    id: 's1', bandId: 'b1', setlistId: 'sl1', mdUserId: 'md1', status: 'live' as const,
    createdAt: '2026-09-08T00:00:00Z', startedAt: '2026-09-08T00:00:01Z', updatedAt: '2026-09-08T00:00:02Z',
  },
  state: {
    sessionId: 's1', revision, currentIndex: revision, currentSongId: `song-${revision}`,
    currentKey: 'C', isRunning: true, updatedAt: '2026-09-08T00:00:02Z',
  },
})

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
    emit: (payload: unknown) => callback?.({ payload }),
  }
  return value
}

function makeClient(revision = 7): Client {
  const channels: Channel[] = []
  return {
    channels,
    rpc: vi.fn(async () => ({ data: [{ session: snapshot(revision).session, state: snapshot(revision).state }], error: null })),
    channel: vi.fn(() => {
      const channel = makeChannel()
      channels.push(channel)
      return channel
    }),
  }
}

describe('BandStageRealtime robustness', () => {
  it('deduplicates concurrent connect calls', async () => {
    const client = makeClient(7)
    const realtime = new BandStageRealtime({ client: client as unknown as SupabaseClient, sessionId: 's1' })

    const [first, second] = await Promise.all([realtime.connect(), realtime.connect()])

    expect(first.state.revision).toBe(7)
    expect(second.state.revision).toBe(7)
    expect(client.channels).toHaveLength(1)
    expect(client.channels[0].subscribe).toHaveBeenCalledTimes(1)
    expect(client.rpc).toHaveBeenCalledTimes(1)
  })

  it('deduplicates concurrent reconnect calls', async () => {
    const client = makeClient(12)
    const realtime = new BandStageRealtime({ client: client as unknown as SupabaseClient, sessionId: 's1' })
    await realtime.connect()

    const [first, second] = await Promise.all([realtime.reconnect(), realtime.reconnect()])

    expect(first.state.revision).toBe(12)
    expect(second.state.revision).toBe(12)
    expect(client.channels[0].unsubscribe).toHaveBeenCalledTimes(1)
    expect(client.channels[0].subscribe).toHaveBeenCalledTimes(2)
    expect(client.rpc).toHaveBeenCalledTimes(2)
  })

  it('reports connection lifecycle states and returns to ERROR when subscription fails', async () => {
    const client = makeClient(4)
    client.channels.push(makeChannel())
    client.channel = vi.fn(() => client.channels[0])
    client.channels[0].subscribe.mockResolvedValueOnce('CHANNEL_ERROR')
    const statuses: string[] = []
    const realtime = new BandStageRealtime({
      client: client as unknown as SupabaseClient,
      sessionId: 's1',
      onConnectionStatus: (status) => statuses.push(status),
    })

    await expect(realtime.connect()).rejects.toThrow(/Falha ao assinar sessão de palco/)
    expect(realtime.status).toBe('ERROR')
    expect(statuses).toEqual(['CONNECTING', 'ERROR'])
  })

  it('ignores events after disconnect', async () => {
    const client = makeClient(5)
    const onEvent = vi.fn()
    const realtime = new BandStageRealtime({
      client: client as unknown as SupabaseClient,
      sessionId: 's1',
      onEvent,
    })
    await realtime.connect()
    await realtime.disconnect()

    client.channels[0].emit(createBandStageEvent({
      type: 'stage.next', sessionId: 's1', revision: 6, actorUserId: 'md1', payload: {},
    }))
    await Promise.resolve()

    expect(onEvent).not.toHaveBeenCalled()
    expect(realtime.status).toBe('DISCONNECTED')
  })

  it('rejects reconnect after permanent disconnect', async () => {
    const client = makeClient(5)
    const realtime = new BandStageRealtime({ client: client as unknown as SupabaseClient, sessionId: 's1' })
    await realtime.connect()
    await realtime.disconnect()

    await expect(realtime.reconnect()).rejects.toThrow(/já foi encerrada/)
    expect(client.channels[0].subscribe).toHaveBeenCalledTimes(1)
  })
})
