import type { StageSession, StageSessionStatus } from './stageSession'
import type { StageSessionState } from './stageSessionState'
import { toStageSessionState } from './stageSessionState'

export type { StageSession, StageSessionState, StageSessionStatus }

export type StageEventType =
  | 'stage.snapshot'
  | 'stage.play'
  | 'stage.pause'
  | 'stage.next'
  | 'stage.previous'
  | 'stage.goto'
  | 'stage.set-key'
  | 'stage.prepare-next'
  | 'stage.clear-prepared'
  | 'stage.annotation-updated'
  | 'stage.session-ended'
  | 'stage.md-changed'

export interface StageEvent<T = unknown> {
  type: StageEventType
  sessionId: string
  revision: number
  actorUserId: string
  eventId: string
  sentAt: string
  payload: T
}

export interface StageSnapshot {
  session: StageSession
  state: StageSessionState
}

export interface StageCommandResult {
  state: StageSessionState
  event: StageEvent
}

export function toStageSession(row: Record<string, unknown>): StageSession {
  return {
    id: String(row.id),
    serviceId: String(row.service_id ?? row.serviceId),
    legacyBandStageSessionId: String(row.legacy_band_stage_session_id ?? row.legacyBandStageSessionId ?? ''),
    mdUserId: row.md_user_id ?? row.mdUserId ? String(row.md_user_id ?? row.mdUserId) : undefined,
    status: row.status as StageSessionStatus,
    createdAt: String(row.created_at ?? row.createdAt),
    startedAt: row.started_at ?? row.startedAt ? String(row.started_at ?? row.startedAt) : undefined,
    endedAt: row.ended_at ?? row.endedAt ? String(row.ended_at ?? row.endedAt) : undefined,
    updatedAt: String(row.updated_at ?? row.updatedAt),
  }
}

export { toStageSessionState }

export function createStageEvent<T>(input: {
  type: StageEventType
  sessionId: string
  revision: number
  actorUserId: string
  payload: T
}): StageEvent<T> {
  return { ...input, eventId: crypto.randomUUID(), sentAt: new Date().toISOString() }
}
