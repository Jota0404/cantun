import { supabase } from '../../lib/supabase'
import type { BandStageSession } from '../../domain/stage/bandStage'

export type BandStageSetlistItem = {
  position: number
  songId: string
  title: string
  artist?: string
  originalKey: string
  currentKey: string
  lyrics: string
  notes?: string
  bpm?: number
}

type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>
}

export async function getBandStageSessionSetlist(
  session: BandStageSession,
  client: RpcClient = supabase,
): Promise<BandStageSetlistItem[]> {
  if (!client) throw new Error('Supabase não está configurado para o Modo Banda.')

  const { data, error } = await client.rpc('get_band_stage_setlist', {
    p_session_id: session.id,
  })

  if (error) throw new Error(error.message)

  const rows = Array.isArray(data) ? data : data ? [data] : []
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)))
    .map((row) => ({
      position: Number(row.position),
      songId: String(row.song_id),
      title: String(row.title),
      artist: row.artist ? String(row.artist) : undefined,
      originalKey: String(row.original_key),
      currentKey: String(row.current_key ?? row.original_key),
      lyrics: String(row.lyrics ?? ''),
      notes: row.notes ? String(row.notes) : undefined,
      bpm: row.bpm === null || row.bpm === undefined ? undefined : Number(row.bpm),
    }))
    .sort((a, b) => a.position - b.position)
}
