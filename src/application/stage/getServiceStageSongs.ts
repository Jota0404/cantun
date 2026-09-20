import { supabase } from '../../lib/supabase'
import type { MusicalKey } from '../../domain/music/musicalKey'
import { toMusicalRole, type MusicalRole } from '../../domain/bands/musicalRole'

export type ServiceStageSong = {
  position: number
  songId: string
  title: string
  artist?: string
  originalKey: MusicalKey
  currentKey: MusicalKey
  lyrics: string
  notes?: string
  bpm?: number
  musicalRole: MusicalRole
}

type Row = {
  position: number
  song_id: string
  title: string
  artist: string | null
  original_key: string
  current_key: string
  lyrics: string
  notes: string | null
  bpm: number | null
  musical_role: string | null
}

const KEYS: MusicalKey[] = ['C','C#','Db','D','D#','Eb','E','F','F#','Gb','G','G#','Ab','A','A#','Bb','B']

function key(value: unknown, fallback: MusicalKey = 'C'): MusicalKey {
  const candidate = String(value ?? fallback)
  return KEYS.includes(candidate as MusicalKey) ? candidate as MusicalKey : fallback
}

export async function getServiceStageSongs(stageSessionId: string): Promise<ServiceStageSong[]> {
  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data, error } = await supabase.rpc('get_service_stage_songs', {
    p_stage_session_id: stageSessionId,
  })
  if (error) throw error

  return ((data ?? []) as Row[]).map((row) => ({
    position: Number(row.position),
    songId: String(row.song_id),
    title: row.title,
    artist: row.artist ?? undefined,
    originalKey: key(row.original_key),
    currentKey: key(row.current_key, key(row.original_key)),
    lyrics: row.lyrics ?? '',
    notes: row.notes ?? undefined,
    bpm: row.bpm == null ? undefined : Number(row.bpm),
    musicalRole: toMusicalRole(row.musical_role),

  }))
}
