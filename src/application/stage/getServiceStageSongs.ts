import type { MusicalKey } from '../../domain/music/musicalKey'
import { stageSessionRepository } from '../../db/repositories/stageSessionRepository'
import { serviceItemRepository } from '../../db/repositories/serviceItemRepository'
import { songRepository } from '../../db/repositories/songRepository'
import { assignmentRepository } from '../../db/repositories/assignmentRepository'
import { getCurrentUser } from '../../platform/auth'
import { isPlatformConfigured } from '../../platform/http'
import { rpc } from '../../platform/rpc'

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
  musicalRole: string
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
  const user = getCurrentUser()
  const [items, assignments] = await Promise.all([
    serviceItemRepository.listByServiceId(session.serviceId),
    user ? assignmentRepository.listByUserId(user.id) : Promise.resolve([]),
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
      musicalRole: assignment?.musicalFunction?.trim() || 'other',
    })
  }
  return result
}

export async function getServiceStageSongs(stageSessionId: string): Promise<ServiceStageSong[]> {
  if (!isPlatformConfigured) return getLocalServiceStageSongs(stageSessionId)
  try {
    const data = await rpc<Row[] | null>('get_service_stage_songs', {
    p_stage_session_id: stageSessionId,
    })

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
      musicalRole: row.musical_role?.trim() || 'other',

    }))
  } catch (error) {
    try {
      return await getLocalServiceStageSongs(stageSessionId)
    } catch {
      throw error
    }
  }
}
