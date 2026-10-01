import { supabase } from '../../lib/supabase'
import type { MusicalRole } from '../../domain/bands/musicalRole'
import { isMusicalRole, MUSICAL_ROLE_LABELS } from '../../domain/bands/musicalRole'

export type MusicalRoleStageExperience = {
  fontSize: number
  readMode: 'scroll' | 'pages'
  showNotes: boolean
  showBpm: boolean
  showKey: boolean
  accentLabel: string
}

const DEFAULT_EXPERIENCE: MusicalRoleStageExperience = {
  fontSize: 22,
  readMode: 'scroll',
  showNotes: true,
  showBpm: true,
  showKey: true,
  accentLabel: 'Função musical',
}

const LOCAL_EXPERIENCES: Partial<Record<MusicalRole, Omit<MusicalRoleStageExperience, 'accentLabel'>>> = {
  vocals: { ...DEFAULT_EXPERIENCE },
  'electric-guitar': { ...DEFAULT_EXPERIENCE },
  'acoustic-guitar': { ...DEFAULT_EXPERIENCE },
  bass: { ...DEFAULT_EXPERIENCE, fontSize: 24, showNotes: false },
  drums: { ...DEFAULT_EXPERIENCE, fontSize: 20, readMode: 'pages', showNotes: false, showKey: false },
  keys: { ...DEFAULT_EXPERIENCE, fontSize: 21 },
  piano: { ...DEFAULT_EXPERIENCE, fontSize: 21 },
  strings: { ...DEFAULT_EXPERIENCE },
  brass: { ...DEFAULT_EXPERIENCE, showNotes: false },
  woodwinds: { ...DEFAULT_EXPERIENCE, showNotes: false },
}

export function getMusicalRoleStageExperience(role: MusicalRole): MusicalRoleStageExperience {
  const base = LOCAL_EXPERIENCES[role] ?? DEFAULT_EXPERIENCE
  return { ...base, accentLabel: MUSICAL_ROLE_LABELS[role] ?? DEFAULT_EXPERIENCE.accentLabel }
}

type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>
}

type StageExperienceRow = {
  musical_role?: unknown
  font_size?: unknown
  read_mode?: unknown
  show_notes?: unknown
  show_bpm?: unknown
  show_key?: unknown
}

function parseStageExperience(value: unknown): MusicalRoleStageExperience | null {
  const row = Array.isArray(value) ? value[0] : value
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null
  const data = row as StageExperienceRow
  const role = isMusicalRole(data.musical_role) ? data.musical_role : 'other'
  const local = getMusicalRoleStageExperience(role)
  return {
    fontSize: Number.isFinite(Number(data.font_size)) ? Number(data.font_size) : local.fontSize,
    readMode: data.read_mode === 'pages' || data.read_mode === 'scroll' ? data.read_mode : local.readMode,
    showNotes: typeof data.show_notes === 'boolean' ? data.show_notes : local.showNotes,
    showBpm: typeof data.show_bpm === 'boolean' ? data.show_bpm : local.showBpm,
    showKey: typeof data.show_key === 'boolean' ? data.show_key : local.showKey,
    accentLabel: local.accentLabel,
  }
}

export async function getMyBandStageExperience(
  bandId: string,
  client: RpcClient | null | undefined = supabase,
): Promise<MusicalRoleStageExperience> {
  if (!client) return getMusicalRoleStageExperience('other')
  const { data, error } = await client.rpc('get_my_band_stage_experience', { p_band_id: bandId })
  if (error) {
    const roleResult = await client.rpc('get_my_band_musical_role', { p_band_id: bandId })
    if (roleResult.error) throw new Error(roleResult.error.message)
    const value = Array.isArray(roleResult.data) ? roleResult.data[0] : roleResult.data
    return getMusicalRoleStageExperience(isMusicalRole(value) ? value : 'other')
  }
  return parseStageExperience(data) ?? getMusicalRoleStageExperience('other')
}

export async function getMyBandMusicalRoleForStage(
  bandId: string,
  client: RpcClient | null | undefined = supabase,
): Promise<MusicalRole> {
  if (!client) return 'other'
  const { data, error } = await client.rpc('get_my_band_musical_role', { p_band_id: bandId })
  if (error) throw new Error(error.message)
  const value = Array.isArray(data) ? data[0] : data
  return isMusicalRole(value) ? value : 'other'
}
