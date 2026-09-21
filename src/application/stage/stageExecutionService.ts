import { BandStageService, type BandStageServiceOptions, type StageCommandResult } from './bandStageService'
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

  constructor(options: BandStageServiceOptions = {}) {
    this.compatibility = new BandStageService(options)
  }

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
    return this.compatibility.getSnapshot(await this.legacySessionId(stageSessionId))
      .then((snapshot) => this.targetSnapshot(stageSessionId, snapshot))
  }

  async play(stageSessionId: string): Promise<StageCommandResult> {
    return this.compatibility.play(await this.legacySessionId(stageSessionId))
      .then((result) => this.targetCommand(stageSessionId, result))
  }

  async pause(stageSessionId: string): Promise<StageCommandResult> {
    return this.compatibility.pause(await this.legacySessionId(stageSessionId))
      .then((result) => this.targetCommand(stageSessionId, result))
  }

  async next(stageSessionId: string): Promise<StageCommandResult> {
    return this.compatibility.next(await this.legacySessionId(stageSessionId))
      .then((result) => this.targetCommand(stageSessionId, result))
  }

  async previous(stageSessionId: string): Promise<StageCommandResult> {
    return this.compatibility.previous(await this.legacySessionId(stageSessionId))
      .then((result) => this.targetCommand(stageSessionId, result))
  }

  async goto(stageSessionId: string, index: number, songId?: string): Promise<StageCommandResult> {
    return this.compatibility.goto(await this.legacySessionId(stageSessionId), index, songId)
      .then((result) => this.targetCommand(stageSessionId, result))
  }

  async setKey(stageSessionId: string, key: string): Promise<StageCommandResult> {
    return this.compatibility.setKey(await this.legacySessionId(stageSessionId), key)
      .then((result) => this.targetCommand(stageSessionId, result))
  }

  async prepareNext(stageSessionId: string, index: number, songId: string): Promise<StageCommandResult> {
    return this.compatibility.prepareNext(await this.legacySessionId(stageSessionId), index, songId)
      .then((result) => this.targetCommand(stageSessionId, result))
  }

  async clearPrepared(stageSessionId: string): Promise<StageCommandResult> {
    return this.compatibility.clearPrepared(await this.legacySessionId(stageSessionId))
      .then((result) => this.targetCommand(stageSessionId, result))
  }

  async setAnnotation(stageSessionId: string, annotation: string | null | undefined): Promise<StageCommandResult> {
    return this.compatibility.setAnnotation(await this.legacySessionId(stageSessionId), annotation)
      .then((result) => this.targetCommand(stageSessionId, result))
  }

  async startSession(stageSessionId: string): Promise<BandStageSession> {
    return this.compatibility.startSession(await this.legacySessionId(stageSessionId))
      .then((session) => ({ ...session, id: stageSessionId }))
  }

  async endSession(stageSessionId: string): Promise<BandStageSession> {
    return this.compatibility.endSession(await this.legacySessionId(stageSessionId))
      .then((session) => ({ ...session, id: stageSessionId }))
  }
}
