import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { StageEvent, StageEventType, StageSnapshot } from '../domain/stage/stage'
import { toStageSession, toStageSessionState } from '../domain/stage/stage'
import type { StageParticipant, StagePresencePayload } from '../domain/stage/stagePresence'
import { presenceStateToStageParticipants } from '../domain/stage/stagePresence'

const EVENT_TYPES: readonly StageEventType[] = [
  'stage.snapshot','stage.play','stage.pause','stage.next','stage.previous',
  'stage.goto','stage.set-key','stage.prepare-next','stage.clear-prepared',
  'stage.annotation-updated','stage.session-ended','stage.md-changed',
]

export type StageConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'SUBSCRIBED' | 'RECONNECTING' | 'ERROR'
type SnapshotReason = 'initial' | 'event' | 'reconnect' | 'revision-gap'

export interface StageRealtimeOptions {
  client: SupabaseClient
  sessionId: string
  onSnapshot?: (snapshot: StageSnapshot, reason: SnapshotReason) => void
  onEvent?: (event: StageEvent) => void
  onStatus?: (status: string) => void
  onConnectionStatus?: (status: StageConnectionStatus) => void
  onPresence?: (participants: StageParticipant[]) => void
}

export function stageChannelName(sessionId: string): string {
  return `stage-session:${sessionId}:state`
}

function isStageEvent(value: unknown): value is StageEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<StageEvent>
  return typeof event.type === 'string' &&
    EVENT_TYPES.includes(event.type as StageEventType) &&
    typeof event.sessionId === 'string' &&
    typeof event.revision === 'number' &&
    Number.isInteger(event.revision) &&
    event.revision >= 0 &&
    typeof event.actorUserId === 'string' &&
    typeof event.eventId === 'string' &&
    typeof event.sentAt === 'string' &&
    'payload' in event
}

export function createStageEvent<T>(input: {
  type: StageEventType
  sessionId: string
  revision: number
  actorUserId: string
  payload: T
}): StageEvent<T> {
  return { ...input, eventId: crypto.randomUUID(), sentAt: new Date().toISOString() }
}

export async function publishStageEvent(channel: RealtimeChannel, event: StageEvent): Promise<void> {
  const result = await channel.send({ type: 'broadcast', event: event.type, payload: event })
  if (result !== 'ok') throw new Error(`Falha ao publicar evento de palco: ${result}`)
}

class StageReconciler {
  private currentRevision = -1
  private readonly seenEventIds = new Set<string>()
  private snapshotInFlight: Promise<StageSnapshot> | null = null

  constructor(private readonly options: StageRealtimeOptions) {}

  private async loadSnapshot(): Promise<StageSnapshot> {
    const { data, error } = await this.options.client.rpc('get_target_stage_snapshot', {
      p_stage_session_id: this.options.sessionId,
    })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    if (!row || typeof row !== 'object') throw new Error('Snapshot de palco inválido.')
    const record = row as Record<string, unknown>
    if (!record.session || !record.state) throw new Error('Snapshot de palco incompleto.')
    return this.normalizeSnapshot({
      session: toStageSession(record.session as Record<string, unknown>),
      state: toStageSessionState(record.state as Record<string, unknown>),
    })
  }

  private normalizeSnapshot(snapshot: StageSnapshot): StageSnapshot {
    return {
      session: { ...snapshot.session, id: this.options.sessionId },
      state: { ...snapshot.state, stageSessionId: this.options.sessionId },
    }
  }

  async reconcile(reason: SnapshotReason): Promise<StageSnapshot> {
    if (this.snapshotInFlight) return this.snapshotInFlight
    this.snapshotInFlight = this.loadSnapshot().finally(() => { this.snapshotInFlight = null })
    const snapshot = await this.snapshotInFlight
    if (snapshot.session.id !== this.options.sessionId || snapshot.state.stageSessionId !== this.options.sessionId) {
      throw new Error('Snapshot de palco pertence a outra sessão.')
    }
    if (snapshot.state.revision >= this.currentRevision) {
      this.currentRevision = snapshot.state.revision
      this.options.onSnapshot?.(snapshot, reason)
    }
    return snapshot
  }

  async acceptEvent(event: StageEvent): Promise<void> {
    if (event.sessionId !== this.options.sessionId) return
    if (this.seenEventIds.has(event.eventId) || event.revision <= this.currentRevision) return
    if (event.revision > this.currentRevision + 1 && this.currentRevision >= 0) {
      await this.reconcile('revision-gap')
      if (event.revision <= this.currentRevision) {
        this.seenEventIds.add(event.eventId)
        return
      }
    }
    this.currentRevision = event.revision
    this.seenEventIds.add(event.eventId)
    this.options.onEvent?.(event)
    if (event.type === 'stage.snapshot') await this.reconcile('event')
  }

  get revision(): number { return this.currentRevision }
  reset(): void { this.currentRevision = -1; this.seenEventIds.clear(); this.snapshotInFlight = null }
}

export class StageRealtime {
  private readonly channel: RealtimeChannel
  private readonly reconciler: StageReconciler
  private subscribed = false
  private connecting: Promise<StageSnapshot> | null = null
  private reconnecting: Promise<StageSnapshot> | null = null
  private disposed = false
  private connectionStatus: StageConnectionStatus = 'DISCONNECTED'
  private presencePayload: StagePresencePayload | null = null
  private lastSnapshotMdUserId: string | null = null

  constructor(private readonly options: StageRealtimeOptions) {
    this.channel = options.client.channel(stageChannelName(options.sessionId), {
      config: { private: true, broadcast: { self: false, ack: true } },
    })
    this.reconciler = new StageReconciler(options)
    this.channel.on('presence', { event: 'sync' }, () => this.emitPresence())
    this.channel.on('presence', { event: 'join' }, () => this.emitPresence())
    this.channel.on('presence', { event: 'leave' }, () => this.emitPresence())
    this.channel.on('broadcast', { event: '*' }, ({ payload }) => {
      if (!isStageEvent(payload) || this.disposed) return
      void this.reconciler.acceptEvent(payload).catch(() => { void this.refresh().catch(() => undefined) })
    })
    this.channel.on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'stage_session_states',
      filter: `stage_session_id=eq.${options.sessionId}`,
    }, () => {
      if (!this.disposed) void this.reconciler.reconcile('event').catch(() => undefined)
    })
  }

  get revision(): number { return this.reconciler.revision }
  get status(): StageConnectionStatus { return this.connectionStatus }

  async connect(): Promise<StageSnapshot> {
    if (this.disposed) throw new Error('Sessão de palco já foi encerrada.')
    if (this.connecting) return this.connecting
    this.setConnectionStatus(this.subscribed ? 'SUBSCRIBED' : 'CONNECTING')
    this.connecting = this.connectInternal().catch((error) => {
      this.setConnectionStatus('ERROR'); throw error
    }).finally(() => { this.connecting = null })
    return this.connecting
  }

  private async connectInternal(): Promise<StageSnapshot> {
    if (!this.subscribed) {
      const status = await new Promise<string>((resolve, reject) => {
        const result = this.channel.subscribe((value) => {
          const status = String(value)
          if (status === 'SUBSCRIBED') resolve(status)
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') reject(new Error(`Falha ao assinar sessão de palco: ${status}`))
        })
        if (typeof result === 'string' && result === 'SUBSCRIBED') resolve(result)
      })
      this.subscribed = true
      this.options.onStatus?.(status)
    }
    this.setConnectionStatus('SUBSCRIBED')
    const snapshot = await this.reconciler.reconcile('initial')
    this.lastSnapshotMdUserId = snapshot.session.mdUserId ?? null
    if (this.presencePayload && snapshot.session.status !== 'ended') await this.trackPresenceInternal(this.presencePayload)
    return snapshot
  }

  async reconnect(): Promise<StageSnapshot> {
    if (this.disposed) throw new Error('Sessão de palco já foi encerrada.')
    if (this.reconnecting) return this.reconnecting
    this.reconnecting = (async () => {
      this.setConnectionStatus('RECONNECTING')
      this.reconciler.reset()
      if (this.subscribed) await this.channel.unsubscribe()
      this.subscribed = false
      return this.connect()
    })().catch((error) => { this.setConnectionStatus('ERROR'); throw error }).finally(() => { this.reconnecting = null })
    return this.reconnecting
  }

  async refresh(): Promise<StageSnapshot> {
    if (this.disposed) throw new Error('Sessão de palco já foi encerrada.')
    return this.reconciler.reconcile('reconnect')
  }

  async trackPresence(payload: StagePresencePayload): Promise<void> {
    if (this.disposed) throw new Error('Sessão de palco já foi encerrada.')
    if (!this.subscribed) throw new Error('Canal de palco não está conectado.')
    this.presencePayload = payload
    await this.trackPresenceInternal(payload)
  }

  private async trackPresenceInternal(payload: StagePresencePayload): Promise<void> {
    const result = await this.channel.track(payload)
    if (result !== 'ok') throw new Error(`Falha ao publicar presença de palco: ${result}`)
    this.emitPresence()
  }

  private emitPresence(): void {
    if (this.disposed) return
    const state = this.channel.presenceState() as Record<string, unknown>
    this.options.onPresence?.(presenceStateToStageParticipants(state, this.lastSnapshotMdUserId ?? ''))
  }

  async publish(event: StageEvent): Promise<void> {
    if (this.disposed) throw new Error('Sessão de palco já foi encerrada.')
    if (!this.subscribed) throw new Error('Canal de palco não está conectado.')
    await publishStageEvent(this.channel, event)
  }

  async disconnect(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.reconciler.reset()
    this.presencePayload = null
    this.lastSnapshotMdUserId = null
    this.subscribed = false
    this.setConnectionStatus('DISCONNECTED')
    await this.channel.unsubscribe()
  }

  private setConnectionStatus(status: StageConnectionStatus): void {
    if (this.connectionStatus === status) return
    this.connectionStatus = status
    this.options.onConnectionStatus?.(status)
  }
}
