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

const EXPERIENCES: Partial<Record<MusicalRole, Omit<MusicalRoleStageExperience, 'accentLabel'>>> = {
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
  const base = EXPERIENCES[role] ?? DEFAULT_EXPERIENCE
  return {
    ...base,
    accentLabel: MUSICAL_ROLE_LABELS[role] ?? DEFAULT_EXPERIENCE.accentLabel,
  }
}

type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>
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
