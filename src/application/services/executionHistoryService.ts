import { repertoireItemRepository } from '../../db/repositories/repertoireItemRepository'
import { repertoireRepository } from '../../db/repositories/repertoireRepository'
import { ApiError } from '../../platform/http'
import { rpc } from '../../platform/rpc'
import { getMemberDisplayNames } from '../teams/teamMemberService'

export interface ServiceExecutionView {
  serviceId: string
  completedAt: string
  completedByUserId: string | null
  stageStartedAt: string | null
  stageEndedAt: string | null
  songs: { position: number; songId: string | null; title: string; artist: string | null; key: string | null }[]
  members: { userId: string | null; name: string; musicalFunction: string }[]
}

export interface SongHistoryView {
  lastPlayedAt: string | null
  playsLast12Months: number
  keys: { key: string | null; count: number }[]
  recent: { serviceId: string; serviceName: string; startsAt: string; completedAt: string; key: string | null }[]
}

type Failure = { success: false; errors: string[] }
const OFFLINE = 'Disponível com conexão.'
const fail = (error: unknown): Failure => ({ success: false, errors: [error instanceof ApiError && error.status !== 0 ? error.message : OFFLINE] })

interface RawExecution {
  service_id: string; organization_id: string; completed_at: string; completed_by_user_id: string | null
  stage_started_at: string | null; stage_ended_at: string | null
  songs: { position: number; song_id: string | null; title: string; artist: string | null; key: string | null }[]
  members: { user_id: string | null; musical_function: string }[]
}
interface RawHistory {
  last_played_at: string | null; plays_last_12_months: number; keys: { key: string | null; count: number }[]
  recent: { service_id: string; service_name: string; starts_at: string; completed_at: string; key: string | null }[]
}

export interface ExecutionHistoryDeps {
  call: typeof rpc
  displayNames: (organizationId: string) => Promise<Record<string, string>>
}
const defaultDeps: ExecutionHistoryDeps = { call: rpc, displayNames: getMemberDisplayNames }

export async function getServiceExecution(serviceId: string, deps: ExecutionHistoryDeps = defaultDeps): Promise<{ success: true; execution: ServiceExecutionView | null } | Failure> {
  try {
    const raw = await deps.call<RawExecution | null>('get_service_execution', { p_service_id: serviceId })
    if (!raw) return { success: true, execution: null }
    const names = await deps.displayNames(raw.organization_id)
    const nameOf = (id: string | null) => (id && names[id]) || 'Ex-membro'
    return {
      success: true,
      execution: {
        serviceId: raw.service_id, completedAt: raw.completed_at,
        completedByUserId: raw.completed_by_user_id,
        stageStartedAt: raw.stage_started_at, stageEndedAt: raw.stage_ended_at,
        songs: raw.songs.map((s) => ({ position: s.position, songId: s.song_id, title: s.title, artist: s.artist, key: s.key })),
        members: raw.members.map((m) => ({ userId: m.user_id, name: nameOf(m.user_id), musicalFunction: m.musical_function })),
      },
    }
  } catch (error) {
    return fail(error)
  }
}

export async function getSongHistory(songId: string, call: typeof rpc = rpc): Promise<{ success: true; history: SongHistoryView } | Failure> {
  try {
    const raw = await call<RawHistory>('get_song_history', { p_song_id: songId })
    return {
      success: true,
      history: {
        lastPlayedAt: raw.last_played_at, playsLast12Months: raw.plays_last_12_months, keys: raw.keys,
        recent: raw.recent.map((r) => ({ serviceId: r.service_id, serviceName: r.service_name, startsAt: r.starts_at, completedAt: r.completed_at, key: r.key })),
      },
    }
  } catch (error) {
    return fail(error)
  }
}

/** RN-08: repertórios da organização que contêm a música (Dexie), por nome. */
export async function listRepertoiresWithSong(songId: string, organizationId: string): Promise<{ id: string; name: string }[]> {
  const [items, repertoires] = await Promise.all([repertoireItemRepository.listBySongId(songId), repertoireRepository.listByOrganizationId(organizationId)])
  const ids = new Set(items.map((i) => i.repertoireId))
  return repertoires.filter((r) => ids.has(r.id)).map((r) => ({ id: r.id, name: r.name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}
