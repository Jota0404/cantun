import { type BandStageServiceOptions, type StageCommandResult } from './bandStageService'
import { BandStageRealtime } from '../../sync/bandStageRealtime'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { toBandStageSession, toBandStageState } from '../../domain/stage/bandStage'
import { normalizeBandStageAnnotation } from './bandStageAnnotationService'
import type { BandStageParticipant, BandStagePresencePayload } from '../../domain/stage/bandStagePresence'
import type { BandStageSnapshot, BandStageSession } from '../../domain/stage/bandStage'

/**
 * Target-domain facade for live Stage execution.
 *
 * StageSession.id is the public application identity. The legacy
 * BandStageService is composed internally as a compatibility runtime.
 */
export class StageExecutionService {
  private readonly realtimeByTarget = new Map<string, BandStageRealtime>()

  private async targetClient() {
    if (!supabase) throw new Error('Supabase não está configurado para o Modo Palco.')
    return supabase
  }

  private async targetState(stageSessionId: string, data: unknown, eventType: StageCommandResult['event']['type'] = 'stage.snapshot', payload: unknown = {}) : Promise<StageCommandResult> {
    const row = Array.isArray(data) ? data[0] : data
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Resposta RPC de palco inválida.')
    const raw = row as Record<string, unknown>
    raw.session_id = stageSessionId
    const state = toBandStageState(raw)
    const snapshot = await this.getSnapshot(stageSessionId)
    if (snapshot.state.revision !== state.revision) throw new Error('Estado de palco mudou durante a publicação; reconciliação necessária.')
    const user = await supabase.auth.getUser()
    const event = { type: eventType, sessionId: stageSessionId, revision: state.revision, actorUserId: user.data.user?.id ?? '', eventId: crypto.randomUUID(), sentAt: new Date().toISOString(), payload: { ...((payload && typeof payload === 'object') ? payload as Record<string, unknown> : {}), state } }
    return { state, event }
  }

  private async targetCommand(stageSessionId: string, rpc: string, eventType: StageCommandResult['event']['type'], args: Record<string, unknown> = {}, payload: Record<string, unknown> = {}) {
    const client = await this.targetClient()
    await this.getSnapshot(stageSessionId)
    const { data, error } = await client.rpc(rpc, { p_stage_session_id: stageSessionId, ...args })
    if (error) throw new Error(error.message)
    const result = await this.targetState(stageSessionId, data, eventType, payload)
    await this.realtimeByTarget.get(stageSessionId)?.publish(result.event).catch(() => undefined)
    return result
  }

  private realtime(stageSessionId: string, callbacks: { onSnapshot?: (snapshot: BandStageSnapshot, reason: 'initial' | 'event' | 'reconnect' | 'revision-gap') => void; onEvent?: (event: StageCommandResult['event']) => void; onStatus?: (status: string) => void; onPresence?: (participants: BandStageParticipant[]) => void } = {}) {
    const existing = this.realtimeByTarget.get(stageSessionId)
    if (existing) return existing
    const client = supabase as unknown as SupabaseClient
    const realtime = new BandStageRealtime({ client, sessionId: stageSessionId, targetSessionId: stageSessionId, targetOnly: true, ...callbacks })
    this.realtimeByTarget.set(stageSessionId, realtime)
    return realtime
  }



  private targetSnapshot(stageSessionId: string, snapshot: BandStageSnapshot): BandStageSnapshot {
    return {
      session: { ...snapshot.session, id: stageSessionId },
      state: { ...snapshot.state, sessionId: stageSessionId },
    }
  }

  async connect(stageSessionId: string, callbacks: {
    onSnapshot?: (snapshot: BandStageSnapshot, reason: 'initial' | 'event' | 'reconnect' | 'revision-gap') => void
    onEvent?: (event: StageCommandResult['event']) => void
    onStatus?: (status: string) => void
    onPresence?: (participants: BandStageParticipant[]) => void
  } = {}): Promise<BandStageSnapshot> {
    return this.realtime(stageSessionId, callbacks).connect()
  }

  async trackPresence(stageSessionId: string, payload: BandStagePresencePayload): Promise<void> {
    return this.realtime(stageSessionId).trackPresence(payload)
  }

  async reconnect(stageSessionId: string): Promise<BandStageSnapshot> {
    return this.realtime(stageSessionId).reconnect()
  }

  async refresh(stageSessionId: string): Promise<BandStageSnapshot> {
    return this.realtime(stageSessionId).refresh()
  }

  async disconnect(stageSessionId: string): Promise<void> {
    const realtime = this.realtimeByTarget.get(stageSessionId)
    this.realtimeByTarget.delete(stageSessionId)
    await realtime?.disconnect()
  }


  async getSnapshot(stageSessionId: string): Promise<BandStageSnapshot> {
    const client = await this.targetClient()
    const { data, error } = await client.rpc('get_target_stage_snapshot', { p_stage_session_id: stageSessionId })
    if (error) throw new Error(error.message)
    const row = Array.isArray(data) ? data[0] : data
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Snapshot de palco inválido.')
    const value = row as Record<string, unknown>
    const session = value.session
    const state = value.state
    if (!session || typeof session !== 'object' || Array.isArray(session)) throw new Error('Snapshot de palco inválido: sessão ausente.')
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Snapshot de palco inválido: estado ausente.')
    return this.targetSnapshot(stageSessionId, { session: toBandStageSession(session as Record<string, unknown>), state: toBandStageState({ ...(state as Record<string, unknown>), session_id: stageSessionId }) })
  }

  async play(stageSessionId: string): Promise<StageCommandResult> {
    return this.targetCommand(stageSessionId, 'target_stage_play', 'stage.play', {}, { isRunning: true })
  }

  async pause(stageSessionId: string): Promise<StageCommandResult> {
    return this.targetCommand(stageSessionId, 'target_stage_pause', 'stage.pause', {}, { isRunning: false })
  }

  async next(stageSessionId: string): Promise<StageCommandResult> {
    return this.targetCommand(stageSessionId, 'target_stage_next', 'stage.next')
  }

  async previous(stageSessionId: string): Promise<StageCommandResult> {
    return this.targetCommand(stageSessionId, 'target_stage_previous', 'stage.previous')
  }

  async goto(stageSessionId: string, index: number, songId?: string): Promise<StageCommandResult> {
    return this.targetCommand(stageSessionId, 'target_stage_goto', 'stage.goto', { p_index: index, p_song_id: songId ?? null }, { currentIndex: index, currentSongId: songId })
  }

  async setKey(stageSessionId: string, key: string): Promise<StageCommandResult> {
    return this.targetCommand(stageSessionId, 'target_stage_set_key', 'stage.set-key', { p_key: key }, { currentKey: key })
  }

  async prepareNext(stageSessionId: string, index: number, songId: string): Promise<StageCommandResult> {
    return this.targetCommand(stageSessionId, 'target_stage_prepare_next', 'stage.prepare-next', { p_index: index, p_song_id: songId }, { preparedIndex: index, preparedSongId: songId })
  }

  async clearPrepared(stageSessionId: string): Promise<StageCommandResult> {
    return this.targetCommand(stageSessionId, 'target_stage_clear_prepared', 'stage.clear-prepared', {}, { preparedIndex: null, preparedSongId: null })
  }

  async setAnnotation(stageSessionId: string, annotation: string | null | undefined): Promise<StageCommandResult> {
    return this.targetCommand(stageSessionId, 'target_stage_set_annotation', 'stage.annotation-updated', { p_annotation: normalizeBandStageAnnotation(annotation) }, { annotation: normalizeBandStageAnnotation(annotation) })
  }

  async startSession(stageSessionId: string): Promise<BandStageSession> {
    const client = await this.targetClient()
    const { error } = await client.rpc('target_stage_start', { p_stage_session_id: stageSessionId })
    if (error) throw new Error(error.message)
    return this.getSnapshot(stageSessionId).then((snapshot) => snapshot.session)
  }

  async endSession(stageSessionId: string): Promise<BandStageSession> {
    const client = await this.targetClient()
    const { error } = await client.rpc('target_stage_end', { p_stage_session_id: stageSessionId })
    if (error) throw new Error(error.message)
    return this.getSnapshot(stageSessionId).then((snapshot) => snapshot.session)
  }
}
