import type { BandStageState } from './bandStage'

export type SharedExecutionStatus = 'lobby' | 'running' | 'paused' | 'ended'

export interface SharedExecutionState {
  sessionId: string
  revision: number
  currentIndex: number
  currentSongId?: string
  currentKey?: string
  preparedIndex?: number
  preparedSongId?: string
  isRunning: boolean
  mdAnnotation?: string
  status: SharedExecutionStatus
  updatedAt: string
}

export function toSharedExecutionState(
  state: BandStageState,
  sessionStatus: 'lobby' | 'live' | 'ended',
): SharedExecutionState {
  return {
    sessionId: state.sessionId,
    revision: state.revision,
    currentIndex: state.currentIndex,
    currentSongId: state.currentSongId,
    currentKey: state.currentKey,
    preparedIndex: state.preparedIndex,
    preparedSongId: state.preparedSongId,
    isRunning: state.isRunning,
    mdAnnotation: state.mdAnnotation,
    status: sessionStatus === 'lobby' ? 'lobby' : sessionStatus === 'ended' ? 'ended' : state.isRunning ? 'running' : 'paused',
    updatedAt: state.updatedAt,
  }
}

export function hasSharedExecutionChanged(a: SharedExecutionState | undefined, b: SharedExecutionState): boolean {
  if (!a) return true
  return (
    a.revision !== b.revision ||
    a.currentIndex !== b.currentIndex ||
    a.currentSongId !== b.currentSongId ||
    a.currentKey !== b.currentKey ||
    a.preparedIndex !== b.preparedIndex ||
    a.preparedSongId !== b.preparedSongId ||
    a.isRunning !== b.isRunning ||
    a.mdAnnotation !== b.mdAnnotation ||
    a.status !== b.status ||
    a.updatedAt !== b.updatedAt
  )
}
