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

export function toStageSessionState(row: Record<string, unknown>): StageSessionState {
  return {
    stageSessionId: String(row.stage_session_id ?? row.session_id),
    revision: Number(row.revision),
    currentIndex: Number(row.current_index),
    currentServiceItemId: row.current_service_item_id ? String(row.current_service_item_id) : undefined,
    currentSongId: row.current_song_id ? String(row.current_song_id) : undefined,
    currentKey: row.current_key ? String(row.current_key) : undefined,
    preparedIndex: row.prepared_index == null ? undefined : Number(row.prepared_index),
    preparedServiceItemId: row.prepared_service_item_id ? String(row.prepared_service_item_id) : undefined,
    preparedSongId: row.prepared_song_id ? String(row.prepared_song_id) : undefined,
    isRunning: Boolean(row.is_running),
    mdAnnotation: row.md_annotation ? String(row.md_annotation) : undefined,
    updatedAt: String(row.updated_at),
  }
}
