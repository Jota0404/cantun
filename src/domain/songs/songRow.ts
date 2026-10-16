import type { Song } from './song'

type Row = Record<string, unknown>
const text = (value: unknown) => value ? String(value) : undefined

/** Linha de `songs` do servidor → `Song`. */
export function toSong(row: Row): Song {
  return {
    id: String(row.id), title: String(row.title), artist: text(row.artist), originalKey: row.original_key as Song['originalKey'],
    currentKey: row.current_key as Song['currentKey'], bpm: row.bpm == null ? undefined : Number(row.bpm), lyrics: String(row.lyrics ?? ''),
    notes: text(row.notes), organizationId: text(row.organization_id), sourceSongId: text(row.source_song_id),
    isFavorite: Boolean(row.is_favorite), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  }
}
