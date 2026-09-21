import { BandStageService, type StageCommandResult } from './bandStageService'
import { getStageSession } from './stageSessionService'
import type { BandStagePresencePayload } from '../../domain/stage/bandStagePresence'
import type { BandStageSnapshot, BandStageSession } from '../../domain/stage/bandStage'

/**
 * Target-domain facade for live Stage execution.
 *
 * The public identity is StageSession.id. The legacy BandStageService remains
 * the internal compatibility runtime until the native target transport/runtime
 * is complete.
 */
export class StageExecutionService extends BandStageService {
  private readonly legacyByTarget = new Map<string, string>()

  private async legacySessionId(stageSessionId: string): Promise<string> {
    const cached = this.legacyByTarget.get(stageSessionId)
    if (cached) return cached
    const session = await getStageSession(stageSessionId)
    this.legacyByTarget.set(stageSessionId, session.legacyBandStageSessionId)
    return session.legacyBandStageSessionId
  }

  async connect(stageSessionId: string, callbacks = {}): Promise<BandStageSnapshot> {
    return super.connect(await this.legacySessionId(stageSessionId), callbacks)
  }
  async trackPresence(stageSessionId: string, payload: BandStagePresencePayload): Promise<void> {
    return super.trackPresence(await this.legacySessionId(stageSessionId), payload)
  }
  async reconnect(stageSessionId: string): Promise<BandStageSnapshot> {
    return super.reconnect(await this.legacySessionId(stageSessionId))
  }
  async refresh(stageSessionId: string): Promise<BandStageSnapshot> {
    return super.refresh(await this.legacySessionId(stageSessionId))
  }
  async disconnect(stageSessionId: string): Promise<void> {
    return super.disconnect(await this.legacySessionId(stageSessionId))
  }
  async getSnapshot(stageSessionId: string): Promise<BandStageSnapshot> {
    return super.getSnapshot(await this.legacySessionId(stageSessionId))
  }
  async play(stageSessionId: string): Promise<StageCommandResult> {
    return super.play(await this.legacySessionId(stageSessionId))
  }
  async pause(stageSessionId: string): Promise<StageCommandResult> {
    return super.pause(await this.legacySessionId(stageSessionId))
  }
  async next(stageSessionId: string): Promise<StageCommandResult> {
    return super.next(await this.legacySessionId(stageSessionId))
  }
  async previous(stageSessionId: string): Promise<StageCommandResult> {
    return super.previous(await this.legacySessionId(stageSessionId))
  }
  async goto(stageSessionId: string, index: number, songId?: string): Promise<StageCommandResult> {
    return super.goto(await this.legacySessionId(stageSessionId), index, songId)
  }
  async setKey(stageSessionId: string, key: string): Promise<StageCommandResult> {
    return super.setKey(await this.legacySessionId(stageSessionId), key)
  }
  async prepareNext(stageSessionId: string, index: number, songId: string): Promise<StageCommandResult> {
    return super.prepareNext(await this.legacySessionId(stageSessionId), index, songId)
  }
  async clearPrepared(stageSessionId: string): Promise<StageCommandResult> {
    return super.clearPrepared(await this.legacySessionId(stageSessionId))
  }
  async setAnnotation(stageSessionId: string, annotation: string | null | undefined): Promise<StageCommandResult> {
    return super.setAnnotation(await this.legacySessionId(stageSessionId), annotation)
  }
  async startSession(stageSessionId: string): Promise<BandStageSession> {
    return super.startSession(await this.legacySessionId(stageSessionId))
  }
  async endSession(stageSessionId: string): Promise<BandStageSession> {
    return super.endSession(await this.legacySessionId(stageSessionId))
  }
}
