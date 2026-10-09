import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RealtimeClient, TopicHandlers } from '../platform/realtime'
import { StageRealtime, stageTopic } from './stageRealtime'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../platform/rpc', () => ({ rpc }))

const SESSION = '6F1C0000-0000-4000-8000-000000000001'
const id = SESSION.toLowerCase()

function raw(revision: number, extra: { status?: string; md?: string; key?: string } = {}) {
  return {
    session: { id, service_id: 'service-1', md_user_id: extra.md ?? 'md-1', status: extra.status ?? 'live', created_at: 't', updated_at: 't' },
    state: { stage_session_id: id, revision, current_index: 0, current_key: extra.key ?? 'C', is_running: true, updated_at: 't' },
  }
}

function setup() {
  let handlers: TopicHandlers | undefined
  const setPresence = vi.fn()
  const unsubscribe = vi.fn()
  const subscribe = vi.fn((_topic: string, value: TopicHandlers) => { handlers = value; return { setPresence, unsubscribe } })
  const onSnapshot = vi.fn()
  const onPresence = vi.fn()
  const onStatus = vi.fn()
  const stage = new StageRealtime({ sessionId: SESSION, onSnapshot, onPresence, onStatus, realtime: { subscribe } as unknown as RealtimeClient })
  const server = {
    snapshot: (value: ReturnType<typeof raw>, first = false) => handlers?.onSnapshot(value, first),
    presence: (participants: unknown[]) => handlers?.onPresence?.(participants),
    status: (status: Parameters<NonNullable<TopicHandlers['onStatus']>>[0]) => handlers?.onStatus?.(status),
    error: (code: 'forbidden' | 'session_expired') => handlers?.onError?.(code),
  }
  return { stage, server, subscribe, setPresence, onSnapshot, onPresence, onStatus }
}

const revisions = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls.map(([snapshot]) => snapshot.state.revision)

describe('StageRealtime', () => {
  beforeEach(() => rpc.mockReset())

  it('subscribes to the lowercase topic and resolves with the first snapshot', async () => {
    const { stage, server, subscribe, onSnapshot } = setup()
    const connected = stage.connect()
    expect(subscribe).toHaveBeenCalledWith(stageTopic(SESSION), expect.anything())
    expect(stageTopic(SESSION)).toBe(`stage-session:${id}`)
    server.snapshot(raw(5), true)
    await expect(connected).resolves.toMatchObject({ state: { revision: 5 } })
    expect(onSnapshot).toHaveBeenCalledWith(expect.anything(), 'initial')
  })

  it('RT-20: discards lower, ignores equal and applies higher revisions, including jumps', async () => {
    const { stage, server, onSnapshot } = setup()
    const connected = stage.connect()
    server.snapshot(raw(5), true)
    await connected
    server.snapshot(raw(4))
    server.snapshot(raw(5))
    server.snapshot(raw(8))
    expect(revisions(onSnapshot)).toEqual([5, 8])
    expect(onSnapshot).toHaveBeenLastCalledWith(expect.anything(), 'event')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('RT-21: the first snapshot after reconnecting replaces local state even with a lower revision', async () => {
    const { stage, server, onSnapshot } = setup()
    const connected = stage.connect()
    server.snapshot(raw(9), true)
    await connected
    server.status('RECONNECTING')
    server.snapshot(raw(2), true)
    expect(revisions(onSnapshot)).toEqual([9, 2])
    expect(onSnapshot).toHaveBeenLastCalledWith(expect.anything(), 'reconnect')
    expect(stage.revision).toBe(2)
  })

  it('RT-22: exposes RECONNECTING and SUBSCRIBED from the socket', async () => {
    const { stage, server, onStatus } = setup()
    void stage.connect()
    server.status('CONNECTING')
    server.status('SUBSCRIBED')
    server.status('RECONNECTING')
    server.status('SUBSCRIBED')
    expect(onStatus.mock.calls.map(([s]) => s)).toEqual(['CONNECTING', 'SUBSCRIBED', 'RECONNECTING', 'SUBSCRIBED'])
  })

  it('RT-23: forbidden or expired session rejects the connection with a message', async () => {
    const { stage, server } = setup()
    const connected = stage.connect()
    server.error('forbidden')
    await expect(connected).rejects.toThrow('Você não tem acesso a esta sessão de palco.')

    const other = setup()
    const again = other.stage.connect()
    other.server.error('session_expired')
    await expect(again).rejects.toThrow('Sua sessão expirou. Entre novamente.')
  })

  it('RT-25: computes isMd from the snapshot, sorts participants and never sends identity', async () => {
    const { stage, server, onPresence, setPresence } = setup()
    const connected = stage.connect()
    server.snapshot(raw(1, { md: 'md-1' }), true)
    await connected
    server.presence([
      { userId: 'u-2', displayName: 'Bruno', musicalRole: 'drums', readiness: 'waiting' },
      { userId: 'u-3', displayName: 'Ana', musicalRole: 'vocals', readiness: 'ready' },
      { userId: 'md-1', displayName: 'Carla', musicalRole: 'keys', readiness: 'waiting' },
    ])
    expect(onPresence.mock.calls[0][0].map((p: { userId: string; isMd: boolean }) => [p.userId, p.isMd])).toEqual([
      ['md-1', true], ['u-3', false], ['u-2', false],
    ])

    await stage.trackPresence({ musicalRole: 'vocals', readiness: 'ready' })
    expect(setPresence).toHaveBeenCalledWith({ musicalRole: 'vocals', readiness: 'ready' })
  })

  it('RT-26: the MD RPC result followed by the same revision is applied once', async () => {
    const { stage, server, onSnapshot } = setup()
    const connected = stage.connect()
    server.snapshot(raw(3), true)
    await connected
    stage.acceptRevision(4)
    server.snapshot(raw(4))
    server.snapshot(raw(3))
    expect(revisions(onSnapshot)).toEqual([3])
    expect(stage.revision).toBe(4)
  })

  it('RT-27: an ended snapshot is delivered and presence stops being published', async () => {
    const { stage, server, onSnapshot, setPresence } = setup()
    const connected = stage.connect()
    server.snapshot(raw(1), true)
    await connected
    server.snapshot(raw(2, { status: 'ended' }))
    expect(onSnapshot.mock.calls.at(-1)?.[0].session.status).toBe('ended')
    await stage.trackPresence({ musicalRole: 'vocals', readiness: 'ready' })
    expect(setPresence).not.toHaveBeenCalled()
  })

  it('RT-28: without network the last state stays and refresh failures do not reset it', async () => {
    const { stage, server, onSnapshot } = setup()
    const connected = stage.connect()
    server.snapshot(raw(6, { key: 'D' }), true)
    await connected
    server.status('RECONNECTING')
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(stage.refresh()).rejects.toThrow('Failed to fetch')
    expect(stage.revision).toBe(6)
    expect(stage.status).toBe('RECONNECTING')
    expect(onSnapshot).toHaveBeenCalledTimes(1)
  })

  it('refresh reads the snapshot through /rpc and applies it by revision', async () => {
    const { stage, server, onSnapshot } = setup()
    const connected = stage.connect()
    server.snapshot(raw(2), true)
    await connected
    rpc.mockResolvedValueOnce(raw(7))
    await expect(stage.refresh()).resolves.toMatchObject({ state: { revision: 7 } })
    expect(rpc).toHaveBeenCalledWith('get_target_stage_snapshot', { p_stage_session_id: SESSION })
    expect(revisions(onSnapshot)).toEqual([2, 7])
  })
})
