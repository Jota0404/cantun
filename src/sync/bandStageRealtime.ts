import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type {
  BandStageEvent,
  BandStageEventType,
  BandStageSession,
  BandStageSnapshot,
  BandStageState,
} from '../domain/stage/bandStage'
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

export interface BandStageRealtimeOptions {
  client: SupabaseClient
  sessionId: string
  onSnapshot?: (snapshot: BandStageSnapshot, reason: 'initial' | 'event' | 'reconnect' | 'revision-gap') => void
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

export async function publishBandStageEvent(
  channel: RealtimeChannel,
  event: BandStageEvent,
): Promise<void> {
  const result = await channel.send({
    type: 'broadcast',
    event: event.type,
    payload: event,
  })
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
  }

  async fetchSnapshot(): Promise<BandStageSnapshot> {
    if (this.snapshotInFlight) return this.snapshotInFlight
    this.snapshotInFlight = this.loadSnapshot().finally(() => {
      this.snapshotInFlight = null
    })
    return this.snapshotInFlight
  }

  async reconcile(reason: 'initial' | 'reconnect' | 'revision-gap' = 'reconnect'): Promise<BandStageSnapshot> {
    const snapshot = await this.fetchSnapshot()
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
      if (snapshot) this.options.onSnapshot?.(snapshot, 'event')
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
    const sessionRow = (record.session ?? record[0]) as Record<string, unknown> | null
    const stateRow = (record.state ?? record[1]) as Record<string, unknown> | null
    if (!sessionRow || !stateRow) throw new Error('Snapshot de palco incompleto.')

    return {
      session: toBandStageSession(sessionRow),
      state: toBandStageState(stateRow),
    }
  }
}

function parseSnapshotPayload(payload: unknown): BandStageSnapshot | null {
  if (!payload || typeof payload !== 'object') return null
  const value = payload as { session?: Record<string, unknown>; state?: Record<string, unknown> }
  if (!value.session || !value.state) return null
  try {
    return {
      session: toBandStageSession(value.session),
      state: toBandStageState(value.state),
    }
  } catch {
    return null
  }
}

export class BandStageRealtime {
  private readonly channel: RealtimeChannel
  private readonly reconciler: BandStageReconciler
  private subscribed = false

  constructor(private readonly options: BandStageRealtimeOptions) {
    this.channel = options.client.channel(bandStageChannelName(options.sessionId), {
      config: { broadcast: { self: false, ack: true } },
    })
    this.reconciler = new BandStageReconciler(options)

    this.channel.on('broadcast', { event: '*' }, ({ payload }) => {
      if (!isStageEvent(payload)) return
      void this.reconciler.acceptEvent(payload)
    })
  }

  get revision(): number {
    return this.reconciler.revision
  }

  async connect(): Promise<BandStageSnapshot> {
    const snapshot = await this.reconciler.reconcile('initial')
    const status = await this.channel.subscribe()
    this.options.onStatus?.(status)
    if (status !== 'SUBSCRIBED') throw new Error(`Falha ao assinar sessão de palco: ${status}`)
    this.subscribed = true
    return snapshot
  }

  async reconnect(): Promise<BandStageSnapshot> {
    this.reconciler.reset()
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
