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
  vocals: { ...DEFAULT_EXPERIENCE, fontSize: 24 },
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
  return {
    ...base,
    accentLabel: MUSICAL_ROLE_LABELS[role] ?? DEFAULT_EXPERIENCE.accentLabel,
  }
}

type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>
}

type StageExperienceRow = {
  musical_role?: unknown
  font_size?: unknown
  read_mode?: unknown
  show_notes?: unknown
  show_bpm?: unknown
  show_key?: unknown
}

function parseStageExperience(value: unknown, fallbackRole: MusicalRole): MusicalRoleStageExperience | null {
  const row = Array.isArray(value) ? value[0] : value
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null
  const data = row as StageExperienceRow
  const role = isMusicalRole(data.musical_role) ? data.musical_role : fallbackRole
  const local = getMusicalRoleStageExperience(role)
  const readMode = data.read_mode === 'pages' ? 'pages' : data.read_mode === 'scroll' ? 'scroll' : local.readMode
  return {
    fontSize: Number.isFinite(Number(data.font_size)) ? Number(data.font_size) : local.fontSize,
    readMode,
    showNotes: typeof data.show_notes === 'boolean' ? data.show_notes : local.showNotes,
    showBpm: typeof data.show_bpm === 'boolean' ? data.show_bpm : local.showBpm,
    showKey: typeof data.show_key === 'boolean' ? data.show_key : local.showKey,
    accentLabel: MUSICAL_ROLE_LABELS[role] ?? local.accentLabel,
  }
}

export async function getMyBandStageExperience(
  bandId: string,
  client: RpcClient | null | undefined = supabase,
): Promise<MusicalRoleStageExperience> {
  const fallbackRole: MusicalRole = 'other'
  if (!client) return getMusicalRoleStageExperience(fallbackRole)
  const { data, error } = await client.rpc('get_my_band_stage_experience', { p_band_id: bandId })
  if (error) {
    const roleData = await client.rpc('get_my_band_musical_role', { p_band_id: bandId })
    if (roleData.error) throw new Error(roleData.error.message)
    const roleValue = Array.isArray(roleData.data) ? roleData.data[0] : roleData.data
    const role = isMusicalRole(roleValue) ? roleValue : fallbackRole
    return getMusicalRoleStageExperience(role)
  }
  return parseStageExperience(data, fallbackRole) ?? getMusicalRoleStageExperience(fallbackRole)
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
