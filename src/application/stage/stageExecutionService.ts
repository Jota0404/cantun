import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { StageRealtime } from '../../sync/stageRealtime'
import { normalizeStageAnnotation } from '../../domain/stage/stageAnnotation'
import type { StageParticipant, StagePresencePayload } from '../../domain/stage/stagePresence'
import type { StageCommandResult, StageEventType, StageSnapshot, StageSession } from '../../domain/stage/stage'
import { createStageEvent, toStageSession, toStageSessionState } from '../../domain/stage/stage'

export class StageExecutionService {
  private readonly realtimeByTarget = new Map<string, StageRealtime>()

  private client(): SupabaseClient {
    if (!supabase) throw new Error('Supabase não está configurado para o Modo Palco.')
    return supabase as unknown as SupabaseClient
  }

  private realtime(stageSessionId: string, callbacks: {
    onSnapshot?: (snapshot: StageSnapshot, reason: 'initial' | 'event' | 'reconnect' | 'revision-gap') => void
    onEvent?: (event: StageCommandResult['event']) => void
    onStatus?: (status: string) => void
    onPresence?: (participants: StageParticipant[]) => void
  } = {}): StageRealtime {
    const existing = this.realtimeByTarget.get(stageSessionId)
    if (existing) return existing
    const realtime = new StageRealtime({ client: this.client(), sessionId: stageSessionId, ...callbacks })
    this.realtimeByTarget.set(stageSessionId, realtime)
    return realtime
  }

  private async command(
    stageSessionId: string,
    rpc: string,
    eventType: StageEventType,
    args: Record<string, unknown> = {},
    payload: Record<string, unknown> = {},
  ): Promise<StageCommandResult> {
    const client = this.client()
    await this.getSnapshot(stageSessionId)
    const { data, error } = await client.rpc(rpc, { p_stage_session_id: stageSessionId, ...args })
    if (error) throw new Error(error.message)
    const row = Array.isArray(data) ? data[0] : data
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Resposta RPC de palco inválida.')
    const state = toStageSessionState({ ...(row as Record<string, unknown>), stage_session_id: stageSessionId })
    const snapshot = await this.getSnapshot(stageSessionId)
    if (snapshot.state.revision !== state.revision) throw new Error('Estado de palco mudou durante a publicação; reconciliação necessária.')
    const user = await client.auth.getUser()
    const event = createStageEvent({
      type: eventType,
      sessionId: stageSessionId,
      revision: state.revision,
      actorUserId: user.data.user?.id ?? '',
      payload: { ...payload, state },
    })
    await this.realtimeByTarget.get(stageSessionId)?.publish(event).catch(() => undefined)
    return { state, event }
  }

  async connect(stageSessionId: string, callbacks: {
    onSnapshot?: (snapshot: StageSnapshot, reason: 'initial' | 'event' | 'reconnect' | 'revision-gap') => void
    onEvent?: (event: StageCommandResult['event']) => void
    onStatus?: (status: string) => void
    onPresence?: (participants: StageParticipant[]) => void
  } = {}): Promise<StageSnapshot> {
    return this.realtime(stageSessionId, callbacks).connect()
  }

  async trackPresence(stageSessionId: string, payload: StagePresencePayload): Promise<void> {
    return this.realtime(stageSessionId).trackPresence(payload)
  }

  async reconnect(stageSessionId: string): Promise<StageSnapshot> {
    return this.realtime(stageSessionId).reconnect()
  }

  async refresh(stageSessionId: string): Promise<StageSnapshot> {
    return this.realtime(stageSessionId).refresh()
  }

  async disconnect(stageSessionId: string): Promise<void> {
    const realtime = this.realtimeByTarget.get(stageSessionId)
    this.realtimeByTarget.delete(stageSessionId)
    await realtime?.disconnect()
  }

  async getSnapshot(stageSessionId: string): Promise<StageSnapshot> {
    const client = this.client()
    const { data, error } = await client.rpc('get_target_stage_snapshot', { p_stage_session_id: stageSessionId })
    if (error) throw new Error(error.message)
    const row = Array.isArray(data) ? data[0] : data
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Snapshot de palco inválido.')
    const value = row as Record<string, unknown>
    if (!value.session || typeof value.session !== 'object' || Array.isArray(value.session)) throw new Error('Snapshot de palco inválido: sessão ausente.')
    if (!value.state || typeof value.state !== 'object' || Array.isArray(value.state)) throw new Error('Snapshot de palco inválido: estado ausente.')
    return {
      session: toStageSession(value.session as Record<string, unknown>),
      state: toStageSessionState(value.state as Record<string, unknown>),
    }
  }

  async play(stageSessionId: string): Promise<StageCommandResult> {
    return this.command(stageSessionId, 'target_stage_play', 'stage.play', {}, { isRunning: true })
  }

  async pause(stageSessionId: string): Promise<StageCommandResult> {
    return this.command(stageSessionId, 'target_stage_pause', 'stage.pause', {}, { isRunning: false })
  }

  async next(stageSessionId: string): Promise<StageCommandResult> {
    return this.command(stageSessionId, 'target_stage_next', 'stage.next')
  }

  async previous(stageSessionId: string): Promise<StageCommandResult> {
    return this.command(stageSessionId, 'target_stage_previous', 'stage.previous')
  }

  async goto(stageSessionId: string, index: number, songId?: string): Promise<StageCommandResult> {
    return this.command(stageSessionId, 'target_stage_goto', 'stage.goto', { p_index: index, p_song_id: songId ?? null })
  }

  async setKey(stageSessionId: string, key: string): Promise<StageCommandResult> {
    return this.command(stageSessionId, 'target_stage_set_key', 'stage.set-key', { p_key: key }, { currentKey: key })
  }

  async prepareNext(stageSessionId: string, index: number, songId: string): Promise<StageCommandResult> {
    return this.command(stageSessionId, 'target_stage_prepare_next', 'stage.prepare-next', { p_index: index, p_song_id: songId })
  }

  async clearPrepared(stageSessionId: string): Promise<StageCommandResult> {
    return this.command(stageSessionId, 'target_stage_clear_prepared', 'stage.clear-prepared')
  }

  async setAnnotation(stageSessionId: string, annotation: string | null | undefined): Promise<StageCommandResult> {
    const value = normalizeStageAnnotation(annotation)
    return this.command(stageSessionId, 'target_stage_set_annotation', 'stage.annotation-updated', { p_annotation: value }, { annotation: value })
  }

  async startSession(stageSessionId: string): Promise<StageSession> {
    const client = this.client()
    const { data, error } = await client.rpc('target_stage_start', { p_stage_session_id: stageSessionId })
    if (error) throw new Error(error.message)
    const snapshot = await this.getSnapshot(stageSessionId)
    const row = Array.isArray(data) ? data[0] : data
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Resposta RPC de palco inválida.')
    const state = toStageSessionState({ ...(row as Record<string, unknown>), stage_session_id: stageSessionId })
    if (snapshot.state.revision !== state.revision) throw new Error('Estado de palco mudou durante a publicação; reconciliação necessária.')
    return snapshot.session
  }

  async endSession(stageSessionId: string): Promise<StageSession> {
    const client = this.client()
    const { data, error } = await client.rpc('target_stage_end', { p_stage_session_id: stageSessionId })
    if (error) throw new Error(error.message)
    const snapshot = await this.getSnapshot(stageSessionId)
    const row = Array.isArray(data) ? data[0] : data
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Resposta RPC de palco inválida.')
    const state = toStageSessionState({ ...(row as Record<string, unknown>), stage_session_id: stageSessionId })
    if (snapshot.state.revision !== state.revision) throw new Error('Estado de palco mudou durante a publicação; reconciliação necessária.')
    return snapshot.session
  }
}
