import { supabase } from '../../lib/supabase'
import type { MusicalRole } from '../../domain/bands/musicalRole'
import { toMusicalRole } from '../../domain/bands/musicalRole'

type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>
}

function singleRow(data: unknown): Record<string, unknown> | null {
  const row = Array.isArray(data) ? data[0] : data
  return row && typeof row === 'object' && !Array.isArray(row) ? row as Record<string, unknown> : null
}

export async function getMyBandMusicalRole(
  bandId: string,
  client: RpcClient | null | undefined = supabase,
): Promise<MusicalRole> {
  if (!client) return 'other'
  const { data, error } = await client.rpc('get_my_band_musical_role', { p_band_id: bandId })
  if (error) throw new Error(error.message)
  return toMusicalRole(Array.isArray(data) ? data[0] : data)
}

export async function updateMyBandMusicalRole(
  bandId: string,
  musicalRole: MusicalRole,
  client: RpcClient | null | undefined = supabase,
): Promise<MusicalRole> {
  if (!client) throw new Error('Supabase não está configurado para o Modo Banda.')
  const { data, error } = await client.rpc('update_my_band_musical_role', {
    p_band_id: bandId,
    p_musical_role: musicalRole,
  })
  if (error) throw new Error(error.message)
  const row = singleRow(data)
  return toMusicalRole(row?.musical_role)
}
