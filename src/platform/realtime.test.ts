import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backoffDelay, HEARTBEAT_MS, PONG_TIMEOUT_MS, RealtimeClient, realtimeUrl, type TopicHandlers } from './realtime'

class FakeSocket {
  static instances: FakeSocket[] = []
  readyState = 0
  sent: Record<string, unknown>[] = []
  closedWith: number | undefined
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  readonly url: string
  constructor(url: string) { this.url = url; FakeSocket.instances.push(this) }
  send(data: string) { this.sent.push(JSON.parse(data) as Record<string, unknown>) }
  close(code = 1005) { this.closedWith = code; this.readyState = 3 }
  open() { this.readyState = 1; this.onopen?.() }
  receive(message: Record<string, unknown>) { this.onmessage?.({ data: JSON.stringify(message) }) }
  drop(code: number) { this.readyState = 3; this.onclose?.({ code }) }
  types() { return this.sent.map((m) => m.type) }
}

const TOPIC = 'stage-session:6f1c0000-0000-4000-8000-000000000001'
const snapshot = (revision: number) => ({ session: { id: 'x' }, state: { revision } })

function setup() {
  const client = new RealtimeClient(() => 'ws://localhost:8787/realtime', (url) => new FakeSocket(url) as unknown as WebSocket)
  const handlers = { onSnapshot: vi.fn(), onPresence: vi.fn(), onStatus: vi.fn(), onError: vi.fn() } satisfies TopicHandlers
  const subscription = client.subscribe(TOPIC.toUpperCase().replace('STAGE-SESSION', 'stage-session'), handlers)
  const socket = () => FakeSocket.instances[FakeSocket.instances.length - 1]
  return { client, handlers, subscription, socket }
}

describe('RealtimeClient', () => {
  beforeEach(() => {
    FakeSocket.instances = []
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
  })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('derives the ws URL from the API base', () => {
    expect(realtimeUrl('http://localhost:8787')).toBe('ws://localhost:8787/realtime')
    expect(realtimeUrl('https://api.cantum.app')).toBe('wss://api.cantum.app/realtime')
  })

  it('subscribes with a lowercase topic and sends presence without identity', () => {
    const { handlers, subscription, socket } = setup()
    socket().open()
    expect(socket().sent[0]).toEqual({ type: 'subscribe', topic: TOPIC })
    socket().receive({ type: 'snapshot', topic: TOPIC, snapshot: snapshot(1) })
    expect(handlers.onSnapshot).toHaveBeenCalledWith(snapshot(1), true)
    expect(handlers.onStatus).toHaveBeenLastCalledWith('SUBSCRIBED')

    subscription.setPresence({ musicalRole: 'vocals', readiness: 'ready' })
    expect(socket().sent.at(-1)).toEqual({ type: 'presence', topic: TOPIC, musicalRole: 'vocals', readiness: 'ready' })
  })

  it('RT-22: reconnects with backoff after 1006, resubscribes and resends the last presence', () => {
    const { handlers, subscription, socket } = setup()
    socket().open()
    subscription.setPresence({ musicalRole: 'drums', readiness: 'ready' })
    const first = socket()
    first.drop(1006)
    expect(handlers.onStatus).toHaveBeenLastCalledWith('RECONNECTING')
    expect(FakeSocket.instances).toHaveLength(1)

    vi.advanceTimersByTime(backoffDelay(0) - 1)
    expect(FakeSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeSocket.instances).toHaveLength(2)

    socket().open()
    expect(socket().sent).toEqual([
      { type: 'subscribe', topic: TOPIC },
      { type: 'presence', topic: TOPIC, musicalRole: 'drums', readiness: 'ready' },
    ])
    socket().receive({ type: 'snapshot', topic: TOPIC, snapshot: snapshot(4) })
    expect(handlers.onSnapshot).toHaveBeenLastCalledWith(snapshot(4), true)
    expect(handlers.onStatus).toHaveBeenLastCalledWith('SUBSCRIBED')
  })

  it('grows the backoff until a snapshot arrives', () => {
    expect([0, 1, 2, 3, 4, 9].map((attempt) => backoffDelay(attempt, () => 0.5))).toEqual([500, 1000, 2000, 4000, 8000, 8000])
    expect(backoffDelay(0, () => 0)).toBe(400)
    expect(backoffDelay(4, () => 1)).toBe(9600)
  })

  it('RT-23: 4401 does not reconnect and reports an expired session', () => {
    const { client, handlers, socket } = setup()
    const onSessionExpired = vi.fn()
    client.onSessionExpired = onSessionExpired
    socket().open()
    socket().drop(4401)
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.instances).toHaveLength(1)
    expect(handlers.onStatus).toHaveBeenLastCalledWith('ERROR')
    expect(handlers.onError).toHaveBeenCalledWith('session_expired')
    expect(onSessionExpired).toHaveBeenCalledTimes(1)
  })

  it('RT-23: forbidden drops only the topic and stops delivering it', () => {
    const { handlers, socket } = setup()
    socket().open()
    socket().receive({ type: 'error', code: 'forbidden', topic: TOPIC, message: 'acesso negado' })
    expect(handlers.onError).toHaveBeenCalledWith('forbidden')
    expect(handlers.onStatus).toHaveBeenLastCalledWith('ERROR')
    expect(socket().closedWith).toBe(1000)
    socket().receive({ type: 'snapshot', topic: TOPIC, snapshot: snapshot(9) })
    expect(handlers.onSnapshot).not.toHaveBeenCalled()
  })

  it('RT-24: pings every 25 s and reconnects when no pong arrives in 10 s', () => {
    const { handlers, socket } = setup()
    socket().open()
    vi.advanceTimersByTime(HEARTBEAT_MS)
    expect(socket().types()).toContain('ping')
    socket().receive({ type: 'pong' })
    vi.advanceTimersByTime(PONG_TIMEOUT_MS)
    expect(FakeSocket.instances).toHaveLength(1)

    vi.advanceTimersByTime(HEARTBEAT_MS - PONG_TIMEOUT_MS + PONG_TIMEOUT_MS)
    expect(handlers.onStatus).toHaveBeenLastCalledWith('RECONNECTING')
    vi.advanceTimersByTime(backoffDelay(0))
    expect(FakeSocket.instances).toHaveLength(2)
  })

  it('re-subscribes on not_subscribed and closes normally when the last topic leaves', () => {
    const { subscription, socket } = setup()
    socket().open()
    socket().receive({ type: 'error', code: 'not_subscribed', topic: TOPIC })
    expect(socket().types().filter((t) => t === 'subscribe')).toHaveLength(2)
    subscription.unsubscribe()
    expect(socket().sent.at(-1)).toEqual({ type: 'unsubscribe', topic: TOPIC })
    expect(socket().closedWith).toBe(1000)
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('reconnects at once when the network comes back', () => {
    const { socket } = setup()
    socket().open()
    socket().drop(1006)
    window.dispatchEvent(new Event('online'))
    expect(FakeSocket.instances).toHaveLength(2)
  })
})
