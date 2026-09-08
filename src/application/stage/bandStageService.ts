import { supabase } from '../../lib/supabase'
import type { BandStageEventType, BandStageSession, BandStageSnapshot, BandStageState } from '../../domain/stage/bandStage'
import { toBandStageSession, toBandStageState } from '../../domain/stage/bandStage'
import { BandStageRealtime, createBandStageEvent } from '../../sync/bandStageRealtime'

export interface BandStageRpcClient {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>
}

type RealtimeCallbacks = {
  onSnapshot?: (snapshot: BandStageSnapshot, reason: 'initial' | 'event' | 'reconnect' | 'revision-gap') => void
  onEvent?: (event: ReturnType<typeof createBandStageEvent>) => void
  onStatus?: (status: string) => void
}

export interface BandStageServiceOptions {
  client?: BandStageRpcClient | null
  realtimeFactory?: (sessionId: string, client: BandStageRpcClient, callbacks?: RealtimeCallbacks) => BandStageRealtime
}

export interface StageCommandResult {
  state: BandStageState
  event: ReturnType<typeof createBandStageEvent>
}

const EVENT_BY_COMMAND = {
  play: 'stage.play',
  pause: 'stage.pause',
  next: 'stage.next',
  previous: 'stage.previous',
  goto: 'stage.goto',
  setKey: 'stage.set-key',
} as const satisfies Record<string, BandStageEventType>

type Command = keyof typeof EVENT_BY_COMMAND

export class BandStageService {
  private readonly client: BandStageRpcClient
  private readonly realtimeFactory: NonNullable<BandStageServiceOptions['realtimeFactory']>
  private readonly realtimeBySession = new Map<string, BandStageRealtime>()

  constructor(options: BandStageServiceOptions = {}) {
    const client = options.client ?? supabase
    if (!client) throw new Error('Supabase não está configurado para o Modo Banda.')
    this.client = client
    this.realtimeFactory = options.realtimeFactory ?? ((sessionId, realtimeClient, callbacks) => new BandStageRealtime({
      client: realtimeClient as never,
      sessionId,
      ...callbacks,
    }))
  }

  async createSession(bandId: string, setlistId: string, mdUserId?: string): Promise<BandStageSession> {
    const { data, error } = await this.client.rpc('create_band_stage_session', {
      p_band_id: bandId,
      p_setlist_id: setlistId,
      p_md_user_id: mdUserId ?? null,
    })
    if (error) throw new Error(error.message)
    return toBandStageSession(this.singleRow(data))
  }

  async startSession(sessionId: string): Promise<BandStageSession> {
    const { data, error } = await this.client.rpc('start_band_stage_session', { p_session_id: sessionId })
    if (error) throw new Error(error.message)
    const session = toBandStageSession(this.singleRow(data))
    await this.publishLifecycleEvent(session)
    return session
  }

  async endSession(sessionId: string): Promise<BandStageSession> {
    const { data, error } = await this.client.rpc('end_band_stage_session', { p_session_id: sessionId })
    if (error) throw new Error(error.message)
    const session = toBandStageSession(this.singleRow(data))
    const realtime = this.realtimeBySession.get(sessionId)
    if (realtime) {
      const snapshot = await this.getSnapshot(sessionId)
      await realtime.publish(createBandStageEvent({
        type: 'stage.session-ended',
        sessionId,
        revision: snapshot.state.revision,
        actorUserId: session.mdUserId,
        payload: snapshot,
      }))
    }
    return session
  }

  async connect(sessionId: string, callbacks: RealtimeCallbacks = {}): Promise<BandStageSnapshot> {
    await this.disconnect(sessionId)
    const realtime = this.realtimeFactory(sessionId, this.client, callbacks)
    this.realtimeBySession.set(sessionId, realtime)
    try {
      return await realtime.connect()
    } catch (error) {
      this.realtimeBySession.delete(sessionId)
      throw error
    }
  }

  async reconnect(sessionId: string): Promise<BandStageSnapshot> {
    const realtime = this.realtimeBySession.get(sessionId)
    if (!realtime) return this.connect(sessionId)
    return realtime.reconnect()
  }

  async refresh(sessionId: string): Promise<BandStageSnapshot> {
    const realtime = this.realtimeBySession.get(sessionId)
    return realtime ? realtime.refresh() : this.getSnapshot(sessionId)
  }

  async disconnect(sessionId: string): Promise<void> {
    const realtime = this.realtimeBySession.get(sessionId)
    this.realtimeBySession.delete(sessionId)
    if (realtime) await realtime.disconnect()
  }

  async play(sessionId: string): Promise<StageCommandResult> {
    return this.command(sessionId, 'play', 'band_stage_play', {}, { isRunning: true })
  }

  async pause(sessionId: string): Promise<StageCommandResult> {
    return this.command(sessionId, 'pause', 'band_stage_pause', {}, { isRunning: false })
  }

  async next(sessionId: string): Promise<StageCommandResult> {
    return this.command(sessionId, 'next', 'band_stage_next', {}, {})
  }

  async previous(sessionId: string): Promise<StageCommandResult> {
    return this.command(sessionId, 'previous', 'band_stage_previous', {}, {})
  }

  async goto(sessionId: string, index: number, songId?: string): Promise<StageCommandResult> {
    return this.command(sessionId, 'goto', 'band_stage_goto', {
      p_index: index,
      p_song_id: songId ?? null,
    }, { currentIndex: index, currentSongId: songId })
  }

  async setKey(sessionId: string, key: string): Promise<StageCommandResult> {
    return this.command(sessionId, 'setKey', 'band_stage_set_key', { p_key: key }, { currentKey: key })
  }

  async getSnapshot(sessionId: string): Promise<BandStageSnapshot> {
    const { data, error } = await this.client.rpc('get_band_stage_snapshot', { p_session_id: sessionId })
    if (error) throw new Error(error.message)
    const row = this.singleRow(data)
    const session = row.session
    const state = row.state
    if (!session || typeof session !== 'object' || Array.isArray(session)) throw new Error('Snapshot de palco inválido: sessão ausente.')
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Snapshot de palco inválido: estado ausente.')
    return { session: toBandStageSession(session as Record<string, unknown>), state: toBandStageState(state as Record<string, unknown>) }
  }

  private async command(
    sessionId: string,
    command: Command,
    rpcName: string,
    args: Record<string, unknown>,
    payload: Record<string, unknown>,
  ): Promise<StageCommandResult> {
    const { data, error } = await this.client.rpc(rpcName, { p_session_id: sessionId, ...args })
    if (error) throw new Error(error.message)
    const state = toBandStageState(this.singleRow(data))
    const snapshot = await this.getSnapshot(sessionId)
    if (snapshot.state.revision !== state.revision) throw new Error('Estado de palco mudou durante a publicação; reconciliação necessária.')

    const event = createBandStageEvent({
      type: EVENT_BY_COMMAND[command],
      sessionId,
      revision: state.revision,
      actorUserId: snapshot.session.mdUserId,
      payload: { ...payload, state },
    })
    const realtime = this.realtimeBySession.get(sessionId)
    if (realtime) await realtime.publish(event)
    return { state, event }
  }

  private async publishLifecycleEvent(session: BandStageSession): Promise<void> {
    const realtime = this.realtimeBySession.get(session.id)
    if (!realtime) return
    const snapshot = await this.getSnapshot(session.id)
    await realtime.publish(createBandStageEvent({
      type: 'stage.snapshot',
      sessionId: session.id,
      revision: snapshot.state.revision,
      actorUserId: session.mdUserId,
      payload: snapshot,
    }))
  }

  private singleRow(data: unknown): Record<string, unknown> {
    const row = Array.isArray(data) ? data[0] : data
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Resposta RPC de palco inválida.')
    return row as Record<string, unknown>
  }
}

export const bandStageService = supabase ? new BandStageService() : null
