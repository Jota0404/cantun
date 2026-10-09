import type { StageSnapshot } from '../domain/stage/stage'
import { toStageSession, toStageSessionState } from '../domain/stage/stage'
import type { StageParticipant, StagePresencePayload } from '../domain/stage/stagePresence'
import { presenceStateToStageParticipants } from '../domain/stage/stagePresence'
import { realtime as defaultRealtime, type RealtimeClient, type RealtimeErrorCode, type RealtimeStatus, type TopicSubscription } from '../platform/realtime'
import { rpc } from '../platform/rpc'

export type StageConnectionStatus = RealtimeStatus
export type StageSnapshotReason = 'initial' | 'event' | 'reconnect'

export interface StageRealtimeOptions {
  sessionId: string
  onSnapshot?: (snapshot: StageSnapshot, reason: StageSnapshotReason) => void
  onStatus?: (status: StageConnectionStatus) => void
  onPresence?: (participants: StageParticipant[]) => void
  realtime?: RealtimeClient
}

export function stageTopic(sessionId: string): string {
  return `stage-session:${sessionId.toLowerCase()}`
}

const ERROR_MESSAGES: Record<RealtimeErrorCode, string> = {
  forbidden: 'Você não tem acesso a esta sessão de palco.',
  session_expired: 'Sua sessão expirou. Entre novamente.',
}

export function toStageSnapshot(value: Record<string, unknown>): StageSnapshot {
  if (!value.session || typeof value.session !== 'object' || Array.isArray(value.session)) throw new Error('Snapshot de palco inválido: sessão ausente.')
  if (!value.state || typeof value.state !== 'object' || Array.isArray(value.state)) throw new Error('Snapshot de palco inválido: estado ausente.')
  return {
    session: toStageSession(value.session as Record<string, unknown>),
    state: toStageSessionState(value.state as Record<string, unknown>),
  }
}

/**
 * Tópico `stage-session:<id>` (docs/REALTIME_CONTRACT.md §4): o servidor envia snapshots completos;
 * revisão menor é descartada, igual é no-op, maior é aplicada. O primeiro snapshot depois de cada
 * subscribe substitui o estado local sem comparar.
 */
export class StageRealtime {
  private currentRevision = -1
  private mdUserId = ''
  private ended = false
  private connectionStatus: StageConnectionStatus = 'DISCONNECTED'
  private subscription: TopicSubscription | null = null
  private pending: { resolve: (snapshot: StageSnapshot) => void; reject: (error: Error) => void } | null = null
  private connecting: Promise<StageSnapshot> | null = null
  private everConnected = false
  private readonly options: StageRealtimeOptions
  private readonly client: RealtimeClient

  constructor(options: StageRealtimeOptions) {
    this.options = options
    this.client = options.realtime ?? defaultRealtime
  }

  get revision(): number { return this.currentRevision }
  get status(): StageConnectionStatus { return this.connectionStatus }

  connect(): Promise<StageSnapshot> {
    if (this.connecting) return this.connecting
    this.connecting = new Promise<StageSnapshot>((resolve, reject) => {
      this.pending = { resolve, reject }
    }).finally(() => { this.connecting = null })
    this.subscription?.unsubscribe()
    this.subscription = this.client.subscribe(stageTopic(this.options.sessionId), {
      onSnapshot: (raw, first) => this.receive(raw, first),
      onPresence: (participants) => this.options.onPresence?.(presenceStateToStageParticipants({ participants }, this.mdUserId)),
      onStatus: (status) => this.setStatus(status),
      onError: (code) => {
        this.subscription = null
        this.pending?.reject(new Error(ERROR_MESSAGES[code]))
        this.pending = null
      },
    })
    return this.connecting
  }

  /** Estado devolvido pela RPC do MD: o snapshot de mesma revisão que chega depois vira no-op. */
  acceptRevision(revision: number): void {
    if (revision > this.currentRevision) this.currentRevision = revision
  }

  /** Botão "Sincronizar": relê por `/rpc`, sem depender do socket. */
  async refresh(): Promise<StageSnapshot> {
    const data = await rpc('get_target_stage_snapshot', { p_stage_session_id: this.options.sessionId })
    const row = Array.isArray(data) ? data[0] : data
    if (!row || typeof row !== 'object') throw new Error('Snapshot de palco inválido.')
    const snapshot = toStageSnapshot(row as Record<string, unknown>)
    this.apply(snapshot, 'reconnect', snapshot.state.revision >= this.currentRevision)
    return snapshot
  }

  /** Só `musicalRole` e `readiness` trafegam: `userId` e nome vêm da sessão no servidor. */
  async trackPresence(payload: StagePresencePayload): Promise<void> {
    if (!this.subscription) throw new Error('Canal de palco não está conectado.')
    if (this.ended) return
    this.subscription.setPresence({ musicalRole: payload.musicalRole, readiness: payload.readiness })
  }

  async disconnect(): Promise<void> {
    this.subscription?.unsubscribe()
    this.subscription = null
    this.pending?.reject(new Error('Sessão de palco desconectada.'))
    this.pending = null
    this.currentRevision = -1
    this.setStatus('DISCONNECTED')
  }

  private receive(raw: Record<string, unknown>, first: boolean) {
    let snapshot: StageSnapshot
    try {
      snapshot = toStageSnapshot(raw)
    } catch {
      return
    }
    if (snapshot.session.id.toLowerCase() !== this.options.sessionId.toLowerCase()) return
    const reason: StageSnapshotReason = first ? (this.everConnected ? 'reconnect' : 'initial') : 'event'
    this.apply(snapshot, reason, first || snapshot.state.revision > this.currentRevision)
    this.everConnected = true
    this.pending?.resolve(snapshot)
    this.pending = null
  }

  private apply(snapshot: StageSnapshot, reason: StageSnapshotReason, accept: boolean) {
    if (!accept) return
    this.currentRevision = snapshot.state.revision
    this.mdUserId = snapshot.session.mdUserId ?? ''
    this.ended = snapshot.session.status === 'ended'
    this.options.onSnapshot?.(snapshot, reason)
  }

  private setStatus(status: StageConnectionStatus) {
    if (this.connectionStatus === status) return
    this.connectionStatus = status
    this.options.onStatus?.(status)
  }
}
