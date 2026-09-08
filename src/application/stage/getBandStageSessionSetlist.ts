import { supabase } from '../../lib/supabase'
import type { BandStageSession } from '../../domain/stage/bandStage'
import type { MusicalKey } from '../../domain/music/musicalKey'
import type { MusicalRole } from '../../domain/bands/musicalRole'
import { toMusicalRole } from '../../domain/bands/musicalRole'

export type BandStageSetlistItem = {
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

type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>
}

function asMusicalKey(value: unknown, fallback: MusicalKey = 'C'): MusicalKey {
  const key = String(value ?? fallback)
  const valid: MusicalKey[] = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B']
  return valid.includes(key as MusicalKey) ? key as MusicalKey : fallback
}

export async function getBandStageSessionSetlist(
  session: BandStageSession,
  client: RpcClient | null | undefined = supabase,
): Promise<BandStageSetlistItem[]> {
  if (!client) throw new Error('Supabase não está configurado para o Modo Banda.')

  const { data, error } = await client.rpc('get_band_stage_setlist', {
    p_session_id: session.id,
  })

  if (error) throw new Error(error.message)

  const rows = Array.isArray(data) ? data : data ? [data] : []
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)))
    .map((row) => {
      const originalKey = asMusicalKey(row.original_key)
      return {
        position: Number(row.position),
        songId: String(row.song_id),
        title: String(row.title),
        artist: row.artist ? String(row.artist) : undefined,
        originalKey,
        currentKey: asMusicalKey(row.current_key, originalKey),
        lyrics: String(row.lyrics ?? ''),
        notes: row.notes ? String(row.notes) : undefined,
        bpm: row.bpm === null || row.bpm === undefined ? undefined : Number(row.bpm),
        musicalRole: toMusicalRole(row.musical_role),
      }
    })
    .sort((a, b) => a.position - b.position)
}
