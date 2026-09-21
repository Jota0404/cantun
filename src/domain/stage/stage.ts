export type StageSessionStatus = 'lobby' | 'live' | 'ended'

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

export interface StageSession {
  id: string
  serviceId: string
  legacyBandStageSessionId: string
  mdUserId?: string
  status: StageSessionStatus
  createdAt: string
  startedAt?: string
  endedAt?: string
  updatedAt: string
}

export interface StageSessionState {
  stageSessionId: string
  revision: number
  currentIndex: number
  currentServiceItemId?: string
  currentSongId?: string
  currentKey?: string
  preparedIndex?: number
  preparedServiceItemId?: string
  preparedSongId?: string
  isRunning: boolean
  mdAnnotation?: string
  updatedAt: string
}

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

export function toStageSessionState(row: Record<string, unknown>): StageSessionState {
  return {
    stageSessionId: String(row.stage_session_id ?? row.session_id ?? row.stageSessionId),
    revision: Number(row.revision),
    currentIndex: Number(row.current_index ?? row.currentIndex),
    currentServiceItemId: row.current_service_item_id ?? row.currentServiceItemId ? String(row.current_service_item_id ?? row.currentServiceItemId) : undefined,
    currentSongId: row.current_song_id ?? row.currentSongId ? String(row.current_song_id ?? row.currentSongId) : undefined,
    currentKey: row.current_key ?? row.currentKey ? String(row.current_key ?? row.currentKey) : undefined,
    preparedIndex: row.prepared_index === null || row.prepared_index === undefined ? (row.preparedIndex == null ? undefined : Number(row.preparedIndex)) : Number(row.prepared_index),
    preparedServiceItemId: row.prepared_service_item_id ?? row.preparedServiceItemId ? String(row.prepared_service_item_id ?? row.preparedServiceItemId) : undefined,
    preparedSongId: row.prepared_song_id ?? row.preparedSongId ? String(row.prepared_song_id ?? row.preparedSongId) : undefined,
    isRunning: Boolean(row.is_running ?? row.isRunning),
    mdAnnotation: row.md_annotation ?? row.mdAnnotation ? String(row.md_annotation ?? row.mdAnnotation) : undefined,
    updatedAt: String(row.updated_at ?? row.updatedAt),
  }
}

export function createStageEvent<T>(input: {
  type: StageEventType
  sessionId: string
  revision: number
  actorUserId: string
  payload: T
}): StageEvent<T> {
  return { ...input, eventId: crypto.randomUUID(), sentAt: new Date().toISOString() }
}
