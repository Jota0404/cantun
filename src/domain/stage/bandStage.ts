export type BandStageSessionStatus = 'lobby' | 'live' | 'ended'

export type BandStageEventType =
  | 'stage.snapshot'
  | 'stage.play'
  | 'stage.pause'
  | 'stage.next'
  | 'stage.previous'
  | 'stage.goto'
  | 'stage.set-key'
  | 'stage.annotation-updated'
  | 'stage.session-ended'
  | 'stage.md-changed'

export interface BandStageSession {
  id: string
  bandId: string
  setlistId: string
  mdUserId: string
  status: BandStageSessionStatus
  createdAt: string
  startedAt?: string
  endedAt?: string
  updatedAt: string
}

export interface BandStageState {
  sessionId: string
  revision: number
  currentIndex: number
  currentSongId?: string
  currentKey?: string
  isRunning: boolean
  mdAnnotation?: string
  updatedAt: string
}

export interface BandStageEvent<T = unknown> {
  type: BandStageEventType
  sessionId: string
  revision: number
  actorUserId: string
  eventId: string
  sentAt: string
  payload: T
}

export interface BandStageSnapshot {
  session: BandStageSession
  state: BandStageState
}

export function toBandStageSession(row: Record<string, unknown>): BandStageSession {
  return {
    id: String(row.id),
    bandId: String(row.band_id),
    setlistId: String(row.setlist_id),
    mdUserId: String(row.md_user_id),
    status: row.status as BandStageSessionStatus,
    createdAt: String(row.created_at),
    startedAt: row.started_at ? String(row.started_at) : undefined,
    endedAt: row.ended_at ? String(row.ended_at) : undefined,
    updatedAt: String(row.updated_at),
  }
}

export function toBandStageState(row: Record<string, unknown>): BandStageState {
  return {
    sessionId: String(row.session_id),
    revision: Number(row.revision),
    currentIndex: Number(row.current_index),
    currentSongId: row.current_song_id ? String(row.current_song_id) : undefined,
    currentKey: row.current_key ? String(row.current_key) : undefined,
    isRunning: Boolean(row.is_running),
    mdAnnotation: row.md_annotation ? String(row.md_annotation) : undefined,
    updatedAt: String(row.updated_at),
  }
}
