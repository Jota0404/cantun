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
  private targetSnapshot(stageSessionId: string, snapshot: BandStageSnapshot): BandStageSnapshot {
    return {
      session: { ...snapshot.session, id: stageSessionId },
      state: { ...snapshot.state, sessionId: stageSessionId },
    }
  }

  private targetCommand(stageSessionId: string, result: StageCommandResult): StageCommandResult {
    return {
      ...result,
      state: { ...result.state, sessionId: stageSessionId },
      event: { ...result.event, sessionId: stageSessionId },
    }
  }
  private readonly legacyByTarget = new Map<string, string>()

  private async legacySessionId(stageSessionId: string): Promise<string> {
    const cached = this.legacyByTarget.get(stageSessionId)
    if (cached) return cached
    const session = await getStageSession(stageSessionId)
    this.legacyByTarget.set(stageSessionId, session.legacyBandStageSessionId)
    return session.legacyBandStageSessionId
  }

  async connect(stageSessionId: string, callbacks = {}): Promise<BandStageSnapshot> {
    return super.connect(await this.legacySessionId(stageSessionId), callbacks).then((snapshot) => this.targetSnapshot(stageSessionId, snapshot))
  }
  async trackPresence(stageSessionId: string, payload: BandStagePresencePayload): Promise<void> {
    return super.trackPresence(await this.legacySessionId(stageSessionId), payload)
  }
  async reconnect(stageSessionId: string): Promise<BandStageSnapshot> {
    return super.reconnect(await this.legacySessionId(stageSessionId)).then((snapshot) => this.targetSnapshot(stageSessionId, snapshot))
  }
  async refresh(stageSessionId: string): Promise<BandStageSnapshot> {
    return super.refresh(await this.legacySessionId(stageSessionId)).then((snapshot) => this.targetSnapshot(stageSessionId, snapshot))
  }
  async disconnect(stageSessionId: string): Promise<void> {
    return super.disconnect(await this.legacySessionId(stageSessionId))
  }
  async getSnapshot(stageSessionId: string): Promise<BandStageSnapshot> {
    return super.getSnapshot(await this.legacySessionId(stageSessionId)).then((snapshot) => this.targetSnapshot(stageSessionId, snapshot))
  }
  async play(stageSessionId: string): Promise<StageCommandResult> {
    return super.play(await this.legacySessionId(stageSessionId)).then((result) => this.targetCommand(stageSessionId, result))
  }
  async pause(stageSessionId: string): Promise<StageCommandResult> {
    return super.pause(await this.legacySessionId(stageSessionId)).then((result) => this.targetCommand(stageSessionId, result))
  }
  async next(stageSessionId: string): Promise<StageCommandResult> {
    return super.next(await this.legacySessionId(stageSessionId)).then((result) => this.targetCommand(stageSessionId, result))
  }
  async previous(stageSessionId: string): Promise<StageCommandResult> {
    return super.previous(await this.legacySessionId(stageSessionId)).then((result) => this.targetCommand(stageSessionId, result))
  }
  async goto(stageSessionId: string, index: number, songId?: string): Promise<StageCommandResult> {
    return super.goto(await this.legacySessionId(stageSessionId), index, songId).then((result) => this.targetCommand(stageSessionId, result))
  }
  async setKey(stageSessionId: string, key: string): Promise<StageCommandResult> {
    return super.setKey(await this.legacySessionId(stageSessionId), key).then((result) => this.targetCommand(stageSessionId, result))
  }
  async prepareNext(stageSessionId: string, index: number, songId: string): Promise<StageCommandResult> {
    return super.prepareNext(await this.legacySessionId(stageSessionId), index, songId).then((result) => this.targetCommand(stageSessionId, result))
  }
  async clearPrepared(stageSessionId: string): Promise<StageCommandResult> {
    return super.clearPrepared(await this.legacySessionId(stageSessionId)).then((result) => this.targetCommand(stageSessionId, result))
  }
  async setAnnotation(stageSessionId: string, annotation: string | null | undefined): Promise<StageCommandResult> {
    return super.setAnnotation(await this.legacySessionId(stageSessionId), annotation).then((result) => this.targetCommand(stageSessionId, result))
  }
  async startSession(stageSessionId: string): Promise<BandStageSession> {
    return super.startSession(await this.legacySessionId(stageSessionId))
  }
  async endSession(stageSessionId: string): Promise<BandStageSession> {
    return super.endSession(await this.legacySessionId(stageSessionId))
  }
}
