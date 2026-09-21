import { BandStageService, type BandStageServiceOptions, type StageCommandResult } from './bandStageService'
import { supabase } from '../../lib/supabase'
import { toBandStageSession, toBandStageState } from '../../domain/stage/bandStage'
import { normalizeBandStageAnnotation } from './bandStageAnnotationService'
import { getStageSession } from './stageSessionService'
import type { BandStageParticipant, BandStagePresencePayload } from '../../domain/stage/bandStagePresence'
import type { BandStageSnapshot, BandStageSession } from '../../domain/stage/bandStage'

/**
 * Target-domain facade for live Stage execution.
 *
 * StageSession.id is the public application identity. The legacy
 * BandStageService is composed internally as a compatibility runtime.
 */
export class StageExecutionService {
  private readonly compatibility: BandStageService
  private readonly legacyByTarget = new Map<string, string>()

  private async targetClient() {
    if (!supabase) throw new Error('Supabase não está configurado para o Modo Palco.')
    return supabase
  }

  private async targetState(stageSessionId: string, data: unknown): Promise<StageCommandResult> {
    const row = Array.isArray(data) ? data[0] : data
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Resposta RPC de palco inválida.')
    const raw = row as Record<string, unknown>
    raw.session_id = stageSessionId
    const state = toBandStageState(raw)
    const snapshot = await this.getSnapshot(stageSessionId)
    if (snapshot.state.revision !== state.revision) throw new Error('Estado de palco mudou durante a publicação; reconciliação necessária.')
    const user = await supabase.auth.getUser()
    return { state, event: { type: 'stage.snapshot', sessionId: stageSessionId, revision: state.revision, actorUserId: user.data.user?.id ?? '', eventId: crypto.randomUUID(), sentAt: new Date().toISOString(), payload: { state } } }
  }

  private async targetCommand(stageSessionId: string, rpc: string, args: Record<string, unknown> = {}) {
    const client = await this.targetClient()
    await this.getSnapshot(stageSessionId)
    const { data, error } = await client.rpc(rpc, { p_stage_session_id: stageSessionId, ...args })
    if (error) throw new Error(error.message)
    return this.targetState(stageSessionId, data)
  }

  constructor(options: BandStageServiceOptions = {}) {
    this.compatibility = new BandStageService(options)
  }

  private targetSnapshot(stageSessionId: string, snapshot: BandStageSnapshot): BandStageSnapshot {
    return {
      session: { ...snapshot.session, id: stageSessionId },
      state: { ...snapshot.state, sessionId: stageSessionId },
    }
  }

  private async legacySessionId(stageSessionId: string): Promise<string> {
    const cached = this.legacyByTarget.get(stageSessionId)
    if (cached) return cached
    const session = await getStageSession(stageSessionId)
    this.legacyByTarget.set(stageSessionId, session.legacyBandStageSessionId)
    return session.legacyBandStageSessionId
  }

  async connect(stageSessionId: string, callbacks: {
    onSnapshot?: (snapshot: BandStageSnapshot, reason: 'initial' | 'event' | 'reconnect' | 'revision-gap') => void
    onEvent?: (event: StageCommandResult['event']) => void
    onStatus?: (status: string) => void
    onPresence?: (participants: BandStageParticipant[]) => void
  } = {}): Promise<BandStageSnapshot> {
    const targetCallbacks = {
      ...callbacks,
      onSnapshot: callbacks.onSnapshot
        ? (snapshot: BandStageSnapshot, reason: 'initial' | 'event' | 'reconnect' | 'revision-gap') =>
            callbacks.onSnapshot?.(this.targetSnapshot(stageSessionId, snapshot), reason)
        : undefined,
      onEvent: callbacks.onEvent
        ? (event: StageCommandResult['event']) =>
            callbacks.onEvent?.({ ...event, sessionId: stageSessionId })
        : undefined,
    }

    return this.compatibility.connect(await this.legacySessionId(stageSessionId), targetCallbacks)
      .then((snapshot) => this.targetSnapshot(stageSessionId, snapshot))
  }

  async trackPresence(stageSessionId: string, payload: BandStagePresencePayload): Promise<void> {
    return this.compatibility.trackPresence(await this.legacySessionId(stageSessionId), payload)
  }

  async reconnect(stageSessionId: string): Promise<BandStageSnapshot> {
    return this.compatibility.reconnect(await this.legacySessionId(stageSessionId))
      .then((snapshot) => this.targetSnapshot(stageSessionId, snapshot))
  }

  async refresh(stageSessionId: string): Promise<BandStageSnapshot> {
    return this.compatibility.refresh(await this.legacySessionId(stageSessionId))
      .then((snapshot) => this.targetSnapshot(stageSessionId, snapshot))
  }

  async disconnect(stageSessionId: string): Promise<void> {
    return this.compatibility.disconnect(await this.legacySessionId(stageSessionId))
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
    return this.targetCommand(stageSessionId, 'target_stage_play')
  }

  async pause(stageSessionId: string): Promise<StageCommandResult> {
    return this.targetCommand(stageSessionId, 'target_stage_pause')
  }

  async next(stageSessionId: string): Promise<StageCommandResult> {
    return this.targetCommand(stageSessionId, 'target_stage_next')
  }

  async previous(stageSessionId: string): Promise<StageCommandResult> {
    return this.targetCommand(stageSessionId, 'target_stage_previous')
  }

  async goto(stageSessionId: string, index: number, songId?: string): Promise<StageCommandResult> {
    return this.targetCommand(stageSessionId, 'target_stage_goto', { p_index: index, p_song_id: songId ?? null })
  }

  async setKey(stageSessionId: string, key: string): Promise<StageCommandResult> {
    return this.targetCommand(stageSessionId, 'target_stage_set_key', { p_key: key })
  }

  async prepareNext(stageSessionId: string, index: number, songId: string): Promise<StageCommandResult> {
    return this.targetCommand(stageSessionId, 'target_stage_prepare_next', { p_index: index, p_song_id: songId })
  }

  async clearPrepared(stageSessionId: string): Promise<StageCommandResult> {
    return this.targetCommand(stageSessionId, 'target_stage_clear_prepared')
  }

  async setAnnotation(stageSessionId: string, annotation: string | null | undefined): Promise<StageCommandResult> {
    return this.targetCommand(stageSessionId, 'target_stage_set_annotation', { p_annotation: normalizeBandStageAnnotation(annotation) })
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
