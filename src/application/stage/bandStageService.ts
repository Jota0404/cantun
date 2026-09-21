import { supabase } from '../../lib/supabase'
import type { BandStageEventType, BandStageSession, BandStageSnapshot, BandStageState } from '../../domain/stage/bandStage'
import { toBandStageSession, toBandStageState } from '../../domain/stage/bandStage'
import { BandStageRealtime, createBandStageEvent } from '../../sync/bandStageRealtime'
import { normalizeBandStageAnnotation } from './bandStageAnnotationService'
import type { BandStageParticipant, BandStagePresencePayload } from '../../domain/stage/bandStagePresence'

export interface BandStageRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>
}

type RealtimeCallbacks = {
  onSnapshot?: (snapshot: BandStageSnapshot, reason: 'initial' | 'event' | 'reconnect' | 'revision-gap') => void
  onEvent?: (event: ReturnType<typeof createBandStageEvent>) => void
  onStatus?: (status: string) => void
  onPresence?: (participants: BandStageParticipant[]) => void
}

export interface BandStageServiceOptions {
  client?: BandStageRpcClient | null
  realtimeFactory?: (sessionId: string, client: BandStageRpcClient, callbacks?: RealtimeCallbacks, targetSessionId?: string) => BandStageRealtime
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
  prepareNext: 'stage.prepare-next',
  clearPrepared: 'stage.clear-prepared',
} as const satisfies Record<string, BandStageEventType>

type Command = keyof typeof EVENT_BY_COMMAND

export class BandStageService {
  private readonly client: BandStageRpcClient
  private readonly realtimeFactory: NonNullable<BandStageServiceOptions['realtimeFactory']>
  private readonly realtimeBySession = new Map<string, BandStageRealtime>()
  private readonly targetSessionByLegacySession = new Map<string, string | null>()

  constructor(options: BandStageServiceOptions = {}) {
    const client = options.client ?? supabase
    if (!client) throw new Error('Supabase não está configurado para o Modo Banda.')
    this.client = client
    this.realtimeFactory = options.realtimeFactory ?? ((sessionId, realtimeClient, callbacks, targetSessionId) => new BandStageRealtime({
      client: realtimeClient as never,
      sessionId,
      targetSessionId,
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
    const targetSessionId = await this.targetSessionId(sessionId)
    const { error } = targetSessionId
      ? await this.client.rpc('target_stage_start', { p_stage_session_id: targetSessionId })
      : await this.client.rpc('start_band_stage_session', { p_session_id: sessionId })
    if (error) throw new Error(error.message)
    const snapshot = await this.getSnapshot(sessionId)
    await this.publishLifecycleEvent(snapshot.session)
    return snapshot.session
  }

  async endSession(sessionId: string): Promise<BandStageSession> {
    const targetSessionId = await this.targetSessionId(sessionId)
    const { error } = targetSessionId
      ? await this.client.rpc('target_stage_end', { p_stage_session_id: targetSessionId })
      : await this.client.rpc('end_band_stage_session', { p_session_id: sessionId })
    if (error) throw new Error(error.message)
    const snapshot = await this.getSnapshot(sessionId)
    const realtime = this.realtimeBySession.get(sessionId)
    if (realtime) {
      await realtime.publish(createBandStageEvent({
        type: 'stage.session-ended',
        sessionId,
        revision: snapshot.state.revision,
        actorUserId: snapshot.session.mdUserId,
        payload: snapshot,
      }))
    }
    return snapshot.session
  }

  async connect(sessionId: string, callbacks: RealtimeCallbacks = {}): Promise<BandStageSnapshot> {
    await this.disconnect(sessionId)
    const targetSessionId = await this.resolveTargetSessionId(sessionId)
    this.targetSessionByLegacySession.set(sessionId, targetSessionId)
    const realtime = this.realtimeFactory(sessionId, this.client, callbacks, targetSessionId ?? undefined)
    this.realtimeBySession.set(sessionId, realtime)
    try {
      return await realtime.connect()
    } catch (error) {
      this.realtimeBySession.delete(sessionId)
      throw error
    }
  }

  async trackPresence(sessionId: string, payload: BandStagePresencePayload): Promise<void> {
    const realtime = this.realtimeBySession.get(sessionId)
    if (!realtime) throw new Error('Sessão de palco não está conectada.')
    await realtime.trackPresence(payload)
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

  async prepareNext(sessionId: string, index: number, songId: string): Promise<StageCommandResult> {
    return this.command(sessionId, 'prepareNext', 'band_stage_prepare_next', {
      p_index: index,
      p_song_id: songId,
    }, { preparedIndex: index, preparedSongId: songId })
  }

  async clearPrepared(sessionId: string): Promise<StageCommandResult> {
    return this.command(sessionId, 'clearPrepared', 'band_stage_clear_prepared', {}, {
      preparedIndex: null,
      preparedSongId: null,
    })
  }

  async setAnnotation(sessionId: string, annotation: string | null | undefined): Promise<StageCommandResult> {
    const normalized = normalizeBandStageAnnotation(annotation)
    const targetSessionId = await this.targetSessionId(sessionId)
    const { data, error } = targetSessionId
      ? await this.client.rpc('target_stage_set_annotation', {
          p_stage_session_id: targetSessionId,
          p_annotation: normalized,
        })
      : await this.client.rpc('band_stage_set_annotation', {
          p_session_id: sessionId,
          p_annotation: normalized,
        })
    if (error) throw new Error(error.message)
    const rawState = this.singleRow(data)
    if (targetSessionId) rawState.session_id = sessionId
    const state = toBandStageState(rawState)
    const snapshot = await this.getSnapshot(sessionId)
    if (snapshot.state.revision !== state.revision) throw new Error('Estado de palco mudou durante a publicação da anotação; reconciliação necessária.')

    const event = createBandStageEvent({
      type: 'stage.annotation-updated',
      sessionId,
      revision: state.revision,
      actorUserId: snapshot.session.mdUserId,
      payload: { annotation: state.mdAnnotation ?? null, state },
    })
    const realtime = this.realtimeBySession.get(sessionId)
    if (realtime) await realtime.publish(event)
    return { state, event }
  }

  async getSnapshot(sessionId: string): Promise<BandStageSnapshot> {
    const targetSessionId = await this.targetSessionId(sessionId)
    const { data, error } = targetSessionId
      ? await this.client.rpc('get_target_stage_snapshot', { p_stage_session_id: targetSessionId })
      : await this.client.rpc('get_band_stage_snapshot', { p_session_id: sessionId })
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
    // Capture the authoritative revision before issuing the command. This preserves the
    // optimistic-concurrency contract of the legacy runtime while target RPCs are bridged.
    await this.getSnapshot(sessionId)
    const targetSessionId = await this.targetSessionId(sessionId)
    const targetRpcByCommand: Record<Command, string> = {
      play: 'target_stage_play',
      pause: 'target_stage_pause',
      next: 'target_stage_next',
      previous: 'target_stage_previous',
      goto: 'target_stage_goto',
      setKey: 'target_stage_set_key',
      prepareNext: 'target_stage_prepare_next',
      clearPrepared: 'target_stage_clear_prepared',
    }
    const targetArgs: Record<string, unknown> = {
      p_stage_session_id: targetSessionId,
      ...(command === 'goto' ? { p_index: args.p_index, p_song_id: args.p_song_id } : {}),
      ...(command === 'setKey' ? { p_key: args.p_key } : {}),
      ...(command === 'prepareNext' ? { p_index: args.p_index, p_song_id: args.p_song_id } : {}),
    }
    const { data, error } = targetSessionId
      ? await this.client.rpc(targetRpcByCommand[command], targetArgs)
      : await this.client.rpc(rpcName, { p_session_id: sessionId, ...args })
    if (error) throw new Error(error.message)
    const rawState = this.singleRow(data)
    if (targetSessionId) rawState.session_id = sessionId
    const state = toBandStageState(rawState)
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

  private async resolveTargetSessionId(legacySessionId: string): Promise<string | null> {
    try {
      const { data, error } = await this.client.rpc('get_stage_session_by_legacy_id', {
        p_legacy_session_id: legacySessionId,
      })
      if (error) return null
      const row = Array.isArray(data) ? data[0] : data
      if (!row || typeof row !== 'object' || Array.isArray(row)) return null
      const id = (row as Record<string, unknown>).id
      return typeof id === 'string' ? id : null
    } catch {
      return null
    }
  }

  private async targetSessionId(legacySessionId: string): Promise<string | null> {
    if (this.targetSessionByLegacySession.has(legacySessionId)) {
      return this.targetSessionByLegacySession.get(legacySessionId) ?? null
    }
    const target = await this.resolveTargetSessionId(legacySessionId)
    this.targetSessionByLegacySession.set(legacySessionId, target)
    return target
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
