import { supabase } from '../../lib/supabase'
import type { MusicalKey } from '../../domain/music/musicalKey'
import { toMusicalRole, type MusicalRole } from '../../domain/bands/musicalRole'
import { stageSessionRepository } from '../../db/repositories/stageSessionRepository'
import { serviceItemRepository } from '../../db/repositories/serviceItemRepository'
import { songRepository } from '../../db/repositories/songRepository'
import { assignmentRepository } from '../../db/repositories/assignmentRepository'
import { supabase } from '../../lib/supabase'

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

async function getLocalServiceStageSongs(stageSessionId: string): Promise<ServiceStageSong[]> {
  const session = await stageSessionRepository.getById(stageSessionId)
  if (!session) throw new Error('Sessão de palco não disponível offline.')
  const [items, assignments] = await Promise.all([
    serviceItemRepository.listByServiceId(session.serviceId),
    supabase?.auth.getUser().then(({ data }) => data.user ? assignmentRepository.listByUserId(data.user.id) : []) ?? Promise.resolve([]),
  ])
  const serviceAssignments = assignments.filter((assignment) => assignment.serviceId === session.serviceId)
  const result: ServiceStageSong[] = []
  for (const item of items) {
    const song = await songRepository.getById(item.songId)
    if (!song) continue
    const assignment = serviceAssignments.find((value) =>
      value.serviceItemId === item.id || value.serviceItemId === undefined
    )
    result.push({
      position: item.position,
      songId: song.id,
      title: song.title,
      artist: song.artist,
      originalKey: song.originalKey,
      currentKey: song.currentKey,
      lyrics: song.lyrics,
      notes: song.notes,
      bpm: song.bpm,
      musicalRole: toMusicalRole(assignment?.musicalFunction),
    })
  }
  return result
}

export async function getServiceStageSongs(stageSessionId: string): Promise<ServiceStageSong[]> {
  if (!supabase) return getLocalServiceStageSongs(stageSessionId)
  try {
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
  } catch (error) {
    try {
      return await getLocalServiceStageSongs(stageSessionId)
    } catch {
      throw error
    }
  }
}
