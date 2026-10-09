import type { StageSession, StageSessionStatus } from './stageSession'
import type { StageSessionState } from './stageSessionState'
import { toStageSessionState } from './stageSessionState'

export type { StageSession, StageSessionState, StageSessionStatus }

export interface StageSnapshot {
  session: StageSession
  state: StageSessionState
}

export interface StageCommandResult {
  state: StageSessionState
}

export function toStageSession(row: Record<string, unknown>): StageSession {
  return {
    id: String(row.id),
    serviceId: String(row.service_id ?? row.serviceId),
    mdUserId: row.md_user_id ?? row.mdUserId ? String(row.md_user_id ?? row.mdUserId) : undefined,
    status: row.status as StageSessionStatus,
    createdAt: String(row.created_at ?? row.createdAt),
    startedAt: row.started_at ?? row.startedAt ? String(row.started_at ?? row.startedAt) : undefined,
    endedAt: row.ended_at ?? row.endedAt ? String(row.ended_at ?? row.endedAt) : undefined,
    updatedAt: String(row.updated_at ?? row.updatedAt),
  }
}

export { toStageSessionState }
