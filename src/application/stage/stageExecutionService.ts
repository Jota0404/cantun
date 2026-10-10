import { rpc } from '../../platform/rpc'
import { StageRealtime, toStageSnapshot, type StageConnectionStatus, type StageSnapshotReason } from '../../sync/stageRealtime'
import { normalizeStageAnnotation } from '../../domain/stage/stageAnnotation'
import type { StageParticipant, StagePresencePayload } from '../../domain/stage/stagePresence'
import type { StageCommandResult, StageSnapshot, StageSession } from '../../domain/stage/stage'
import { toStageSessionState } from '../../domain/stage/stage'

export interface StageConnectionCallbacks {
  onSnapshot?: (snapshot: StageSnapshot, reason: StageSnapshotReason) => void
  onStatus?: (status: StageConnectionStatus) => void
  onPresence?: (participants: StageParticipant[]) => void
}

function firstRow(data: unknown, message: string): Record<string, unknown> {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(message)
  return row as Record<string, unknown>
}

export class StageExecutionService {
  private readonly realtimeByTarget = new Map<string, StageRealtime>()

  private realtime(stageSessionId: string, callbacks: StageConnectionCallbacks = {}): StageRealtime {
    const existing = this.realtimeByTarget.get(stageSessionId)
    if (existing) return existing
    const realtime = new StageRealtime({ sessionId: stageSessionId, ...callbacks })
    this.realtimeByTarget.set(stageSessionId, realtime)
    return realtime
  }

  // Mutação só por RPC; o snapshot de mesma revisão que chega pelo socket depois é no-op (REALTIME_CONTRACT §4).
  private async command(stageSessionId: string, name: string, args: Record<string, unknown> = {}): Promise<StageCommandResult> {
    const row = firstRow(await rpc(name, { p_stage_session_id: stageSessionId, ...args }), 'Resposta RPC de palco inválida.')
    const state = toStageSessionState({ ...row, stage_session_id: stageSessionId })
    this.realtimeByTarget.get(stageSessionId)?.acceptRevision(state.revision)
    return { state }
  }

  async connect(stageSessionId: string, callbacks: StageConnectionCallbacks = {}): Promise<StageSnapshot> {
    return this.realtime(stageSessionId, callbacks).connect()
  }

  async trackPresence(stageSessionId: string, payload: StagePresencePayload): Promise<void> {
    return this.realtime(stageSessionId).trackPresence(payload)
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
    const data = await rpc('get_target_stage_snapshot', { p_stage_session_id: stageSessionId })
    return toStageSnapshot(firstRow(data, 'Snapshot de palco inválido.'))
  }

  async play(stageSessionId: string): Promise<StageCommandResult> {
    return this.command(stageSessionId, 'target_stage_play')
  }

  async pause(stageSessionId: string): Promise<StageCommandResult> {
    return this.command(stageSessionId, 'target_stage_pause')
  }

  async next(stageSessionId: string): Promise<StageCommandResult> {
    return this.command(stageSessionId, 'target_stage_next')
  }

  async previous(stageSessionId: string): Promise<StageCommandResult> {
    return this.command(stageSessionId, 'target_stage_previous')
  }

  async goto(stageSessionId: string, index: number, songId?: string): Promise<StageCommandResult> {
    return this.command(stageSessionId, 'target_stage_goto', { p_index: index, p_song_id: songId ?? null })
  }

  async setKey(stageSessionId: string, key: string): Promise<StageCommandResult> {
    return this.command(stageSessionId, 'target_stage_set_key', { p_key: key })
  }

  async prepareNext(stageSessionId: string, index: number, songId: string): Promise<StageCommandResult> {
    return this.command(stageSessionId, 'target_stage_prepare_next', { p_index: index, p_song_id: songId })
  }

  async clearPrepared(stageSessionId: string): Promise<StageCommandResult> {
    return this.command(stageSessionId, 'target_stage_clear_prepared')
  }

  async setAnnotation(stageSessionId: string, annotation: string | null | undefined): Promise<StageCommandResult> {
    return this.command(stageSessionId, 'target_stage_set_annotation', { p_annotation: normalizeStageAnnotation(annotation) })
  }

  async endSession(stageSessionId: string): Promise<StageSession> {
    await this.command(stageSessionId, 'target_stage_end')
    return (await this.getSnapshot(stageSessionId)).session
  }
}
