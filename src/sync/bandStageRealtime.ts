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
  targetSessionId?: string
  targetOnly?: boolean
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

  private readonly options: BandStageRealtimeOptions

  constructor(options: BandStageRealtimeOptions) {
    this.options = options
  }

  private canonicalSessionId(): string {
    return this.options.targetSessionId ?? this.options.sessionId
  }

  private normalizeSnapshot(snapshot: BandStageSnapshot): BandStageSnapshot {
    const sessionId = this.canonicalSessionId()
    return {
      session: { ...snapshot.session, id: sessionId },
      state: { ...snapshot.state, sessionId },
    }
  }

  private normalizeEvent(event: BandStageEvent): BandStageEvent {
    return this.options.targetSessionId && event.sessionId !== this.options.targetSessionId
      ? { ...event, sessionId: this.options.targetSessionId }
      : event
  }

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
    const normalizedSnapshot = this.normalizeSnapshot(snapshot)
    if (normalizedSnapshot.session.id !== this.canonicalSessionId()) {
      throw new Error('Snapshot de palco pertence a outra sessão.')
    }
    if (normalizedSnapshot.state.sessionId !== this.canonicalSessionId()) {
      throw new Error('Estado de palco pertence a outra sessão.')
    }

    if (snapshot.state.revision >= this.currentRevision) {
      this.currentRevision = snapshot.state.revision
      this.options.onSnapshot?.(normalizedSnapshot, reason)
    }
    return normalizedSnapshot
  }

  async acceptEvent(event: BandStageEvent): Promise<'applied' | 'ignored' | 'reconciled'> {
    const normalizedEvent = this.normalizeEvent(event)
    if (normalizedEvent.sessionId !== this.canonicalSessionId()) return 'ignored'
    if (this.seenEventIds.has(normalizedEvent.eventId)) return 'ignored'
    if (normalizedEvent.revision <= this.currentRevision) {
      this.seenEventIds.add(normalizedEvent.eventId)
      return 'ignored'
    }

    let reconciled = false
    if (normalizedEvent.revision > this.currentRevision + 1 && this.currentRevision >= 0) {
      reconciled = true
      await this.reconcile('revision-gap')
      if (normalizedEvent.revision <= this.currentRevision) {
        this.seenEventIds.add(normalizedEvent.eventId)
        return 'reconciled'
      }
    }

    this.currentRevision = normalizedEvent.revision
    this.seenEventIds.add(normalizedEvent.eventId)
    this.options.onEvent?.(normalizedEvent)

    if (normalizedEvent.type === 'stage.snapshot') {
      const snapshot = parseSnapshotPayload(normalizedEvent.payload, this.canonicalSessionId())
      if (snapshot && snapshot.session.id === this.canonicalSessionId() && snapshot.state.sessionId === this.canonicalSessionId()) {
        if (snapshot.state.revision >= this.currentRevision) {
          this.currentRevision = snapshot.state.revision
          this.options.onSnapshot?.(snapshot, 'event')
        }
      }
    }

    return reconciled ? 'reconciled' : 'applied'
  }

  private async loadSnapshot(): Promise<BandStageSnapshot> {
    let data: unknown = null
    let error: { message?: string } | null = null

    const { data: targetData, error: targetError } = await this.options.client.rpc(
      this.options.targetSessionId ? 'get_target_stage_snapshot' : 'get_target_stage_snapshot_by_legacy_id',
      this.options.targetSessionId
        ? { p_stage_session_id: this.options.targetSessionId }
        : { p_legacy_session_id: this.options.sessionId },
    )

    if (!targetError && targetData) {
      data = targetData
    } else {
      const legacy = await this.options.client.rpc('get_band_stage_snapshot', {
        p_session_id: this.options.sessionId,
      })
      data = legacy.data
      error = legacy.error
    }

    if (error) throw error
    if (!data) throw new Error('Snapshot de palco não encontrado.')

    const row = Array.isArray(data) ? data[0] : data
    if (!row || typeof row !== 'object') throw new Error('Snapshot de palco inválido.')

    const record = row as Record<string, unknown>
    const session = isRowRecord(record.session) ? record.session : null
    const state = isRowRecord(record.state) ? record.state : null
    if (!session || !state) throw new Error('Snapshot de palco incompleto.')

    return this.normalizeSnapshot({ session: toBandStageSession(session), state: toBandStageState(state) })
  }
}

function isRowRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function parseSnapshotPayload(payload: unknown, canonicalSessionId: string): BandStageSnapshot | null {
  if (!payload || typeof payload !== 'object') return null
  const value = payload as { session?: Record<string, unknown>; state?: Record<string, unknown> }
  if (!value.session || !value.state) return null
  try {
    const snapshot = { session: toBandStageSession(value.session), state: toBandStageState(value.state) }
    return {
      session: { ...snapshot.session, id: canonicalSessionId },
      state: { ...snapshot.state, sessionId: canonicalSessionId },
    }
  } catch {
    return null
  }
}

export class BandStageRealtime {
  private readonly channel: RealtimeChannel
  private targetChannel: RealtimeChannel | null = null
  private targetSubscribed = false
  private readonly reconciler: BandStageReconciler
  private subscribed = false
  private connecting: Promise<BandStageSnapshot> | null = null
  private reconnecting: Promise<BandStageSnapshot> | null = null
  private disposed = false
  private connectionStatus: BandStageConnectionStatus = 'DISCONNECTED'
  private presencePayload: BandStagePresencePayload | null = null
  private lastSnapshotMdUserId: string | null = null

  private readonly options: BandStageRealtimeOptions

  constructor(options: BandStageRealtimeOptions) {
    this.options = options
    const targetOnly = options.targetOnly === true && Boolean(options.targetSessionId)
    this.channel = options.client.channel(
      targetOnly ? `stage-session:${options.targetSessionId}:state` : bandStageChannelName(options.sessionId),
      { config: { private: true, broadcast: { self: false, ack: true } } },
    )
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
      void this.reconciler.acceptEvent(this.normalizeInboundEvent(payload)).catch(() => {
        void this.refresh().catch(() => undefined)
      })
    })

    if (options.targetSessionId && !options.targetOnly) {
      this.targetChannel = options.client.channel(`stage-session:${options.targetSessionId}:state`, {
        config: { private: true },
      })
      this.targetChannel.on('presence', { event: 'sync' }, () => {
        if (this.disposed) return
        this.emitTargetPresence()
      })
      this.targetChannel.on('presence', { event: 'join' }, () => {
        if (this.disposed) return
        this.emitTargetPresence()
      })
      this.targetChannel.on('presence', { event: 'leave' }, () => {
        if (this.disposed) return
        this.emitTargetPresence()
      })
      this.targetChannel.on('broadcast', { event: '*' }, ({ payload }) => {
        if (!isStageEvent(payload) || this.disposed) return
        void this.reconciler.acceptEvent(this.normalizeInboundEvent(payload)).catch(() => {
          void this.refresh().catch(() => undefined)
        })
      })
      this.targetChannel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'stage_session_states',
          filter: `stage_session_id=eq.${options.targetSessionId}`,
        },
        () => {
          if (this.disposed) return
          void this.reconciler.reconcile('event').catch(() => undefined)
        },
      )
    }
  }

  private normalizeInboundEvent(event: BandStageEvent): BandStageEvent {
    return this.options.targetSessionId
      ? { ...event, sessionId: this.options.targetSessionId }
      : event
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

  private async subscribeChannel(): Promise<string> {
    return this.subscribeChannelFor(this.channel)
  }

  private async subscribeChannelFor(channel: RealtimeChannel): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let settled = false
      const settle = (status: string) => {
        if (settled) return
        settled = true
        if (status === 'SUBSCRIBED') resolve(status)
        else reject(new Error(`Falha ao assinar sessão de palco: ${status}`))
      }

      const result = channel.subscribe((status) => settle(String(status)))
      if (typeof result === 'string') settle(result)
      else if (result && typeof (result as unknown as { then?: unknown }).then === 'function') {
        void (result as unknown as Promise<unknown>).then((value) => {
          if (typeof value === 'string') settle(value)
        }).catch(reject)
      }
    })
  }

  private async connectInternal(): Promise<BandStageSnapshot> {
    if (!this.subscribed) {
      const status = await this.subscribeChannel()
      this.options.onStatus?.(status)
      this.subscribed = true
      if (this.targetChannel) {
        try {
          const targetStatus = await this.subscribeChannelFor(this.targetChannel)
          this.targetSubscribed = true
          this.options.onStatus?.(`TARGET_${targetStatus}`)
        } catch {
          this.targetSubscribed = false
          this.options.onStatus?.('TARGET_ERROR')
        }
      }
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
      if (this.targetChannel) await this.targetChannel.unsubscribe()
      this.options.onStatus?.(`UNSUBSCRIBED:${status}`)
      this.subscribed = false
      this.targetSubscribed = false
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
    this.presencePayload = payload
    await this.trackPresenceInternal(payload)
  }

  private async trackPresenceInternal(payload: BandStagePresencePayload): Promise<void> {
    if (this.targetChannel && this.targetSubscribed) {
      try {
        const targetResult = await this.targetChannel.track(payload)
        if (targetResult !== 'ok') throw new Error(`Falha ao publicar presença alvo de palco: ${targetResult}`)
        this.emitTargetPresence()
        // Legacy Presence remains a compatibility mirror.
        await this.channel.track(payload).catch(() => undefined)
        return
      } catch {
        // Fall back to legacy transport if the target channel is temporarily unavailable.
        this.targetSubscribed = false
      }
    }
    const result = await this.channel.track(payload)
    if (result !== 'ok') throw new Error(`Falha ao publicar presença de palco: ${result}`)
    this.emitPresence()
  }

  private emitPresence(): void {
    if (this.disposed) return
    const state = this.channel.presenceState() as Record<string, unknown>
    this.options.onPresence?.(presenceStateToParticipants(state, this.lastSnapshotMdUserId ?? ''))
  }

  private emitTargetPresence(): void {
    if (this.disposed || !this.targetChannel) return
    const state = this.targetChannel.presenceState() as Record<string, unknown>
    this.options.onPresence?.(presenceStateToParticipants(state, this.lastSnapshotMdUserId ?? ''))
  }

  async publish(event: BandStageEvent): Promise<void> {
    if (this.disposed) throw new Error('Sessão de palco já foi encerrada.')
    if (!this.subscribed) throw new Error('Canal de palco não está conectado.')
    try {
      if (this.targetChannel && this.targetSubscribed) {
        try {
          const targetEvent = this.options.targetSessionId
            ? { ...event, sessionId: this.options.targetSessionId }
            : event
          await publishBandStageEvent(this.targetChannel, targetEvent)
          // Keep legacy broadcast as an additive compatibility mirror.
          await publishBandStageEvent(this.channel, event).catch(() => undefined)
          return
        } catch {
          // Target transport failed; use the legacy channel as the compatibility fallback.
          this.targetSubscribed = false
        }
      }
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
    this.targetSubscribed = false
    this.setConnectionStatus('DISCONNECTED')
    await this.channel.unsubscribe()
    if (this.targetChannel) await this.targetChannel.unsubscribe()
  }

  private setConnectionStatus(status: BandStageConnectionStatus): void {
    if (this.connectionStatus === status) return
    this.connectionStatus = status
    this.options.onConnectionStatus?.(status)
  }
}
