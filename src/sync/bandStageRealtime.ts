import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { BandStageEvent, BandStageEventType, BandStageSnapshot } from '../domain/stage/bandStage'
import { toBandStageSession, toBandStageState } from '../domain/stage/bandStage'
import type { BandStageParticipant, BandStagePresencePayload } from '../domain/stage/bandStagePresence'
import { presenceStateToParticipants } from '../domain/stage/bandStagePresence'

const EVENT_TYPES: readonly BandStageEventType[] = [
  'stage.snapshot',
  'stage.play',
  'stage.pause',
  'stage.next',
  'stage.previous',
  'stage.goto',
  'stage.set-key',
  'stage.prepare-next',
  'stage.clear-prepared',
  'stage.annotation-updated',
  'stage.session-ended',
  'stage.md-changed',
]

type SnapshotReason = 'initial' | 'event' | 'reconnect' | 'revision-gap'
export type BandStageConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'SUBSCRIBED' | 'RECONNECTING' | 'ERROR'

export interface BandStageRealtimeOptions {
  client: SupabaseClient
  sessionId: string
  onSnapshot?: (snapshot: BandStageSnapshot, reason: SnapshotReason) => void
  onEvent?: (event: BandStageEvent) => void
  onStatus?: (status: string) => void
  onConnectionStatus?: (status: BandStageConnectionStatus) => void
  onPresence?: (participants: BandStageParticipant[]) => void
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
      if (snapshot && snapshot.session.id === this.options.sessionId && snapshot.state.sessionId === this.options.sessionId) {
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
  private readonly options: BandStageRealtimeOptions
  private readonly channel: RealtimeChannel
  private readonly reconciler: BandStageReconciler
  private subscribed = false
  private connecting: Promise<BandStageSnapshot> | null = null
  private reconnecting: Promise<BandStageSnapshot> | null = null
  private disposed = false
  private connectionStatus: BandStageConnectionStatus = 'DISCONNECTED'
  private presencePayload: BandStagePresencePayload | null = null
  private lastSnapshotMdUserId: string | null = null

  constructor(options: BandStageRealtimeOptions) {
    this.options = options
    this.channel = options.client.channel(bandStageChannelName(options.sessionId), {
      config: { private: true, broadcast: { self: false, ack: true } },
    })
    this.reconciler = new BandStageReconciler(options)
    this.channel.on('presence', { event: 'sync' }, () => {
      if (this.disposed) return
      this.emitPresence()
    })
    this.channel.on('presence', { event: 'join' }, () => {
      if (this.disposed) return
      this.emitPresence()
    })
    this.channel.on('presence', { event: 'leave' }, () => {
      if (this.disposed) return
      this.emitPresence()
    })
    this.channel.on('broadcast', { event: '*' }, ({ payload }) => {
      if (!isStageEvent(payload) || this.disposed) return
      void this.reconciler.acceptEvent(payload).catch(() => {
        void this.refresh().catch(() => undefined)
      })
    })
  }

  get revision(): number {
    return this.reconciler.revision
  }

  get status(): BandStageConnectionStatus {
    return this.connectionStatus
  }

  async connect(): Promise<BandStageSnapshot> {
    if (this.disposed) throw new Error('Sessão de palco já foi encerrada.')
    if (this.connecting) return this.connecting

    this.setConnectionStatus(this.subscribed ? 'SUBSCRIBED' : 'CONNECTING')
    this.connecting = this.connectInternal().catch((error) => {
      this.setConnectionStatus('ERROR')
      throw error
    }).finally(() => {
      this.connecting = null
    })
    return this.connecting
  }

  private async connectInternal(): Promise<BandStageSnapshot> {
    if (!this.subscribed) {
      await new Promise<void>((resolve, reject) => {
        this.channel.subscribe((status, error) => {
          this.options.onStatus?.(status)
          if (status === 'SUBSCRIBED') {
            this.subscribed = true
            resolve()
            return
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            this.subscribed = false
            reject(error ?? new Error(`Falha ao assinar sessão de palco: ${status}`))
          }
        })
      })
    }

    this.setConnectionStatus('SUBSCRIBED')
    const snapshot = await this.reconciler.reconcile('initial')
    this.lastSnapshotMdUserId = snapshot.session.mdUserId
    if (this.presencePayload && snapshot.session.status !== 'ended') await this.trackPresenceInternal(this.presencePayload)
    if (snapshot.session.status === 'ended') await this.channel.untrack().catch(() => undefined)
    return snapshot
  }

  async reconnect(): Promise<BandStageSnapshot> {
    if (this.disposed) throw new Error('Sessão de palco já foi encerrada.')
    if (this.reconnecting) return this.reconnecting

    this.reconnecting = this.reconnectInternal().catch((error) => {
      this.setConnectionStatus('ERROR')
      throw error
    }).finally(() => {
      this.reconnecting = null
    })
    return this.reconnecting
  }

  private async reconnectInternal(): Promise<BandStageSnapshot> {
    this.setConnectionStatus('RECONNECTING')
    this.reconciler.reset()

    if (this.subscribed) {
      const status = await this.channel.unsubscribe()
      this.options.onStatus?.(`UNSUBSCRIBED:${status}`)
      this.subscribed = false
    }

    return this.connect()
  }

  async refresh(): Promise<BandStageSnapshot> {
    if (this.disposed) throw new Error('Sessão de palco já foi encerrada.')
    return this.reconciler.reconcile('reconnect')
  }

  async trackPresence(payload: BandStagePresencePayload): Promise<void> {
    if (this.disposed) throw new Error('Sessão de palco já foi encerrada.')
    if (!this.subscribed) throw new Error('Canal de palco não está conectado.')
    if (this.lastSnapshotMdUserId === null) throw new Error('Snapshot de palco ainda não foi carregado.')

    const { data, error } = await this.options.client.auth.getUser()
    if (error || !data.user) throw new Error('Não foi possível validar a identidade para publicar presença de palco.')
    if (data.user.id !== payload.userId) throw new Error('A presença de palco deve pertencer ao usuário autenticado.')

    const normalizedPayload: BandStagePresencePayload = {
      ...payload,
      isMd: payload.userId === this.lastSnapshotMdUserId,
    }
    this.presencePayload = normalizedPayload
    await this.trackPresenceInternal(normalizedPayload)
  }

  private async trackPresenceInternal(payload: BandStagePresencePayload): Promise<void> {
    const result = await this.channel.track(payload)
    if (result !== 'ok') throw new Error(`Falha ao publicar presença de palco: ${result}`)
    this.emitPresence()
  }

  private emitPresence(): void {
    if (this.disposed) return
    const state = this.channel.presenceState() as Record<string, unknown>
    this.options.onPresence?.(presenceStateToParticipants(state, this.lastSnapshotMdUserId ?? ''))
  }

  async publish(event: BandStageEvent): Promise<void> {
    if (this.disposed) throw new Error('Sessão de palco já foi encerrada.')
    if (!this.subscribed) throw new Error('Canal de palco não está conectado.')
    try {
      await publishBandStageEvent(this.channel, event)
    } catch (error) {
      this.setConnectionStatus('ERROR')
      throw error
    }
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

  private setConnectionStatus(status: BandStageConnectionStatus): void {
    if (this.connectionStatus === status) return
    this.connectionStatus = status
    this.options.onConnectionStatus?.(status)
  }
}
