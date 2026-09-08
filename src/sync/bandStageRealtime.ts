import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { BandStageEvent, BandStageEventType, BandStageSnapshot } from '../domain/stage/bandStage'
import { toBandStageSession, toBandStageState } from '../domain/stage/bandStage'

const EVENT_TYPES: readonly BandStageEventType[] = [
  'stage.snapshot',
  'stage.play',
  'stage.pause',
  'stage.next',
  'stage.previous',
  'stage.goto',
  'stage.set-key',
  'stage.session-ended',
  'stage.md-changed',
]

type SnapshotReason = 'initial' | 'event' | 'reconnect' | 'revision-gap'

export interface BandStageRealtimeOptions {
  client: SupabaseClient
  sessionId: string
  onSnapshot?: (snapshot: BandStageSnapshot, reason: SnapshotReason) => void
  onEvent?: (event: BandStageEvent) => void
  onStatus?: (status: string) => void
}

export function bandStageChannelName(sessionId: string): string {
  return `band-stage:${sessionId}`
}

function isStageEvent(value: unknown): value is BandStageEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<BandStageEvent>
  return (
    typeof event.type === 'string' &&
    EVENT_TYPES.includes(event.type as BandStageEventType) &&
    typeof event.sessionId === 'string' &&
    typeof event.revision === 'number' &&
    Number.isInteger(event.revision) &&
    event.revision >= 0 &&
    typeof event.actorUserId === 'string' &&
    typeof event.eventId === 'string' &&
    typeof event.sentAt === 'string' &&
    'payload' in event
  )
}

export function createBandStageEvent<T>(input: {
  type: BandStageEventType
  sessionId: string
  revision: number
  actorUserId: string
  payload: T
}): BandStageEvent<T> {
  return {
    ...input,
    eventId: crypto.randomUUID(),
    sentAt: new Date().toISOString(),
  }
}

export async function publishBandStageEvent(channel: RealtimeChannel, event: BandStageEvent): Promise<void> {
  const result = await channel.send({ type: 'broadcast', event: event.type, payload: event })
  if (result !== 'ok') throw new Error(`Falha ao publicar evento de palco: ${result}`)
}

export class BandStageReconciler {
  private currentRevision = -1
  private readonly seenEventIds = new Set<string>()
  private snapshotInFlight: Promise<BandStageSnapshot> | null = null

  constructor(private readonly options: BandStageRealtimeOptions) {}

  get revision(): number {
    return this.currentRevision
  }

  reset(): void {
    this.currentRevision = -1
    this.seenEventIds.clear()
    this.snapshotInFlight = null
  }

  async fetchSnapshot(): Promise<BandStageSnapshot> {
    if (this.snapshotInFlight) return this.snapshotInFlight
    this.snapshotInFlight = this.loadSnapshot().finally(() => {
      this.snapshotInFlight = null
    })
    return this.snapshotInFlight
  }

  async reconcile(reason: SnapshotReason = 'reconnect'): Promise<BandStageSnapshot> {
    const snapshot = await this.fetchSnapshot()
    if (snapshot.session.id !== this.options.sessionId) {
      throw new Error('Snapshot de palco pertence a outra sessão.')
    }
    if (snapshot.state.sessionId !== this.options.sessionId) {
      throw new Error('Estado de palco pertence a outra sessão.')
    }

    if (snapshot.state.revision >= this.currentRevision) {
      this.currentRevision = snapshot.state.revision
      this.options.onSnapshot?.(snapshot, reason)
    }
    return snapshot
  }

  async acceptEvent(event: BandStageEvent): Promise<'applied' | 'ignored' | 'reconciled'> {
    if (event.sessionId !== this.options.sessionId) return 'ignored'
    if (this.seenEventIds.has(event.eventId)) return 'ignored'
    if (event.revision <= this.currentRevision) {
      this.seenEventIds.add(event.eventId)
      return 'ignored'
    }

    if (event.revision > this.currentRevision + 1 && this.currentRevision >= 0) {
      await this.reconcile('revision-gap')
      if (event.revision <= this.currentRevision) {
        this.seenEventIds.add(event.eventId)
        return 'reconciled'
      }
    }

    this.currentRevision = event.revision
    this.seenEventIds.add(event.eventId)
    this.options.onEvent?.(event)

    if (event.type === 'stage.snapshot') {
      const snapshot = parseSnapshotPayload(event.payload)
      if (snapshot && snapshot.state.sessionId === this.options.sessionId) {
        if (snapshot.state.revision >= this.currentRevision) {
          this.currentRevision = snapshot.state.revision
          this.options.onSnapshot?.(snapshot, 'event')
        }
      }
    }

    return 'applied'
  }

  private async loadSnapshot(): Promise<BandStageSnapshot> {
    const { data, error } = await this.options.client.rpc('get_band_stage_snapshot', {
      p_session_id: this.options.sessionId,
    })
    if (error) throw error
    if (!data) throw new Error('Snapshot de palco não encontrado.')

    const row = Array.isArray(data) ? data[0] : data
    if (!row || typeof row !== 'object') throw new Error('Snapshot de palco inválido.')

    const record = row as Record<string, unknown>
    const session = isRowRecord(record.session) ? record.session : null
    const state = isRowRecord(record.state) ? record.state : null
    if (!session || !state) throw new Error('Snapshot de palco incompleto.')

    return { session: toBandStageSession(session), state: toBandStageState(state) }
  }
}

function isRowRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function parseSnapshotPayload(payload: unknown): BandStageSnapshot | null {
  if (!payload || typeof payload !== 'object') return null
  const value = payload as { session?: Record<string, unknown>; state?: Record<string, unknown> }
  if (!value.session || !value.state) return null
  try {
    return { session: toBandStageSession(value.session), state: toBandStageState(value.state) }
  } catch {
    return null
  }
}

export class BandStageRealtime {
  private readonly channel: RealtimeChannel
  private readonly reconciler: BandStageReconciler
  private subscribed = false
  private connecting: Promise<BandStageSnapshot> | null = null

  constructor(private readonly options: BandStageRealtimeOptions) {
    this.channel = options.client.channel(bandStageChannelName(options.sessionId), {
      config: { broadcast: { self: false, ack: true } },
    })
    this.reconciler = new BandStageReconciler(options)
    this.channel.on('broadcast', { event: '*' }, ({ payload }) => {
      if (!isStageEvent(payload)) return
      void this.reconciler.acceptEvent(payload).catch(() => {
        void this.reconciler.reconcile('revision-gap').catch(() => undefined)
      })
    })
  }

  get revision(): number {
    return this.reconciler.revision
  }

  async connect(): Promise<BandStageSnapshot> {
    if (this.connecting) return this.connecting

    this.connecting = this.connectInternal().finally(() => {
      this.connecting = null
    })
    return this.connecting
  }

  private async connectInternal(): Promise<BandStageSnapshot> {
    if (!this.subscribed) {
      const status = await this.channel.subscribe()
      this.options.onStatus?.(status)
      if (status !== 'SUBSCRIBED') {
        this.subscribed = false
        throw new Error(`Falha ao assinar sessão de palco: ${status}`)
      }
      this.subscribed = true
    }

    // Subscribe first, then load the authoritative snapshot. This closes the
    // late-join/reconnect race where events could be emitted between the RPC
    // snapshot and channel subscription.
    return this.reconciler.reconcile('initial')
  }

  async reconnect(): Promise<BandStageSnapshot> {
    this.reconciler.reset()
    if (this.subscribed) {
      const status = await this.channel.unsubscribe()
      this.options.onStatus?.(`UNSUBSCRIBED:${status}`)
      this.subscribed = false
    }
    return this.connect()
  }

  async refresh(): Promise<BandStageSnapshot> {
    return this.reconciler.reconcile('reconnect')
  }

  async publish(event: BandStageEvent): Promise<void> {
    if (!this.subscribed) throw new Error('Canal de palco não está conectado.')
    await publishBandStageEvent(this.channel, event)
  }

  async disconnect(): Promise<void> {
    this.subscribed = false
    await this.channel.unsubscribe()
  }
}
