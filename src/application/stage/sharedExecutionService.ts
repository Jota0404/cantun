import type { BandStageService, StageCommandResult } from './bandStageService'
import type { BandStageSnapshot } from '../../domain/stage/bandStage'
import type { SharedExecutionState } from '../../domain/stage/sharedExecution'
import { toSharedExecutionState } from '../../domain/stage/sharedExecution'

export type SharedExecutionListener = (state: SharedExecutionState) => void

export class SharedExecutionService {
  private readonly stateBySession = new Map<string, SharedExecutionState>()
  private readonly listenersBySession = new Map<string, Set<SharedExecutionListener>>()

  constructor(private readonly stageService: BandStageService) {}

  get(sessionId: string): SharedExecutionState | undefined {
    return this.stateBySession.get(sessionId)
  }

  applySnapshot(snapshot: BandStageSnapshot): SharedExecutionState {
    const current = this.stateBySession.get(snapshot.session.id)
    const next = toSharedExecutionState(snapshot.state, snapshot.session.status)

    // Snapshots can arrive from an initial read, an explicit refresh or a
    // delayed event reconciliation. Never let an older revision roll the UI
    // backwards.
    if (current && next.revision < current.revision) return current
    if (current && next.revision === current.revision && next.updatedAt < current.updatedAt) return current

    this.stateBySession.set(snapshot.session.id, next)
    for (const listener of this.listenersBySession.get(snapshot.session.id) ?? []) listener(next)
    return next
  }

  subscribe(sessionId: string, listener: SharedExecutionListener): () => void {
    const listeners = this.listenersBySession.get(sessionId) ?? new Set<SharedExecutionListener>()
    listeners.add(listener)
    this.listenersBySession.set(sessionId, listeners)
    const current = this.stateBySession.get(sessionId)
    if (current) listener(current)

    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) this.listenersBySession.delete(sessionId)
    }
  }

  async play(sessionId: string): Promise<StageCommandResult> {
    return this.stageService.play(sessionId)
  }

  async pause(sessionId: string): Promise<StageCommandResult> {
    return this.stageService.pause(sessionId)
  }

  async next(sessionId: string): Promise<StageCommandResult> {
    return this.stageService.next(sessionId)
  }

  async previous(sessionId: string): Promise<StageCommandResult> {
    return this.stageService.previous(sessionId)
  }

  async goto(sessionId: string, index: number, songId?: string): Promise<StageCommandResult> {
    return this.stageService.goto(sessionId, index, songId)
  }

  async setKey(sessionId: string, key: string): Promise<StageCommandResult> {
    return this.stageService.setKey(sessionId, key)
  }

  async end(sessionId: string): Promise<void> {
    await this.stageService.endSession(sessionId)
  }

  dispose(sessionId: string): void {
    this.stateBySession.delete(sessionId)
    this.listenersBySession.delete(sessionId)
  }
}
