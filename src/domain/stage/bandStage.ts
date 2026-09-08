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

function requiredString(row: Record<string, unknown>, field: string): string {
  const value = row[field]
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Campo ${field} inválido no snapshot de palco.`)
  return value
}

function optionalString(row: Record<string, unknown>, field: string): string | undefined {
  const value = row[field]
  if (value === null || value === undefined || value === '') return undefined
  if (typeof value !== 'string') throw new Error(`Campo ${field} inválido no snapshot de palco.`)
  return value
}

function nonNegativeInteger(row: Record<string, unknown>, field: string): number {
  const value = row[field]
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`Campo ${field} inválido no estado de palco.`)
  return Number(value)
}

export function toBandStageSession(row: Record<string, unknown>): BandStageSession {
  const status = row.status
  if (status !== 'lobby' && status !== 'live' && status !== 'ended') throw new Error('Campo status inválido na sessão de palco.')

  return {
    id: requiredString(row, 'id'),
    bandId: requiredString(row, 'band_id'),
    setlistId: requiredString(row, 'setlist_id'),
    mdUserId: requiredString(row, 'md_user_id'),
    status,
    createdAt: requiredString(row, 'created_at'),
    startedAt: optionalString(row, 'started_at'),
    endedAt: optionalString(row, 'ended_at'),
    updatedAt: requiredString(row, 'updated_at'),
  }
}

export function toBandStageState(row: Record<string, unknown>): BandStageState {
  const isRunning = row.is_running
  if (typeof isRunning !== 'boolean') throw new Error('Campo is_running inválido no estado de palco.')

  return {
    sessionId: requiredString(row, 'session_id'),
    revision: nonNegativeInteger(row, 'revision'),
    currentIndex: nonNegativeInteger(row, 'current_index'),
    currentSongId: optionalString(row, 'current_song_id'),
    currentKey: optionalString(row, 'current_key'),
    preparedIndex: row.prepared_index === null || row.prepared_index === undefined ? undefined : nonNegativeInteger(row, 'prepared_index'),
    preparedSongId: optionalString(row, 'prepared_song_id'),
    isRunning,
    mdAnnotation: optionalString(row, 'md_annotation'),
    updatedAt: requiredString(row, 'updated_at'),
  }
}
