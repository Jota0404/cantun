import { supabase } from '../../lib/supabase'
import type { MusicalRole } from '../../domain/bands/musicalRole'
import { isMusicalRole } from '../../domain/bands/musicalRole'

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

const EXPERIENCES: Partial<Record<MusicalRole, MusicalRoleStageExperience>> = {
  vocals: {
    ...DEFAULT_EXPERIENCE,
    fontSize: 24,
    showBpm: true,
    accentLabel: 'Vocal',
  },
  'electric-guitar': {
    ...DEFAULT_EXPERIENCE,
    fontSize: 22,
    accentLabel: 'Guitarra elétrica',
  },
  'acoustic-guitar': {
    ...DEFAULT_EXPERIENCE,
    fontSize: 22,
    accentLabel: 'Violão',
  },
  bass: {
    ...DEFAULT_EXPERIENCE,
    fontSize: 24,
    showNotes: false,
    accentLabel: 'Baixo',
  },
  drums: {
    ...DEFAULT_EXPERIENCE,
    fontSize: 20,
    readMode: 'pages',
    showNotes: false,
    showKey: false,
    accentLabel: 'Bateria',
  },
  keys: {
    ...DEFAULT_EXPERIENCE,
    fontSize: 21,
    accentLabel: 'Teclas',
  },
  piano: {
    ...DEFAULT_EXPERIENCE,
    fontSize: 21,
    accentLabel: 'Piano',
  },
  strings: {
    ...DEFAULT_EXPERIENCE,
    fontSize: 22,
    accentLabel: 'Cordas',
  },
  brass: {
    ...DEFAULT_EXPERIENCE,
    fontSize: 22,
    showNotes: false,
    accentLabel: 'Metais',
  },
  woodwinds: {
    ...DEFAULT_EXPERIENCE,
    fontSize: 22,
    showNotes: false,
    accentLabel: 'Madeiras',
  },
}

export function getMusicalRoleStageExperience(role: MusicalRole): MusicalRoleStageExperience {
  return EXPERIENCES[role] ?? DEFAULT_EXPERIENCE
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
  return isMusicalRole(data) ? data : 'other'
}
