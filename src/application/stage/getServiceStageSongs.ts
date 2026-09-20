import type { Song } from '../../domain/songs/song'
import { supabase } from '../../lib/supabase'

type ServiceStageSongRow = {
  position: number
  song_id: string
  title: string
  artist: string | null
  original_key: string
  current_key: string
  lyrics: string
  notes: string | null
  bpm: number | null
}

export async function getServiceStageSongs(stageSessionId: string): Promise<Array<{ position: number; song: Song }>> {
  if (!supabase) throw new Error('Supabase não está configurado.')

  const { data, error } = await supabase.rpc('get_service_stage_songs', {
    p_stage_session_id: stageSessionId,
  })
  if (error) throw error

  return ((data ?? []) as ServiceStageSongRow[]).map((row) => ({
    position: row.position,
    song: {
      id: row.song_id,
      title: row.title,
      artist: row.artist ?? '',
      originalKey: row.original_key,
      currentKey: row.current_key,
      lyrics: row.lyrics,
      notes: row.notes ?? '',
      bpm: row.bpm ?? undefined,
    },
  }))
}
