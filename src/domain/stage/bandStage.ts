export type BandStageSessionStatus = 'lobby' | 'live' | 'ended'

export type BandStageEventType =
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
  preparedIndex?: number
  preparedSongId?: string
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
    bandId: String(row.band_id ?? row.bandId),
    setlistId: String(row.setlist_id ?? row.setlistId),
    mdUserId: String(row.md_user_id ?? row.mdUserId),
    status: row.status as BandStageSessionStatus,
    createdAt: String(row.created_at ?? row.createdAt),
    startedAt: row.started_at ?? row.startedAt ? String(row.started_at ?? row.startedAt) : undefined,
    endedAt: row.ended_at ?? row.endedAt ? String(row.ended_at ?? row.endedAt) : undefined,
    updatedAt: String(row.updated_at ?? row.updatedAt),
  }
}

export function toBandStageState(row: Record<string, unknown>): BandStageState {
  return {
    sessionId: String(row.session_id ?? row.stage_session_id ?? row.sessionId),
    revision: Number(row.revision),
    currentIndex: Number(row.current_index ?? row.currentIndex),
    currentSongId: row.current_song_id ?? row.currentSongId ? String(row.current_song_id ?? row.currentSongId) : undefined,
    currentKey: row.current_key ?? row.currentKey ? String(row.current_key ?? row.currentKey) : undefined,
    preparedIndex: row.prepared_index === null || row.prepared_index === undefined ? (row.preparedIndex == null ? undefined : Number(row.preparedIndex)) : Number(row.prepared_index),
    preparedSongId: row.prepared_song_id ?? row.preparedSongId ? String(row.prepared_song_id ?? row.preparedSongId) : undefined,
    isRunning: Boolean(row.is_running ?? row.isRunning),
    mdAnnotation: row.md_annotation ?? row.mdAnnotation ? String(row.md_annotation ?? row.mdAnnotation) : undefined,
    updatedAt: String(row.updated_at ?? row.updatedAt),
  }
}
