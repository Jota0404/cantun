import { supabase } from '../../lib/supabase'
import type { MusicalRole } from '../../domain/bands/musicalRole'
import { toMusicalRole } from '../../domain/bands/musicalRole'
import { getLegacyBandOrganizationContext } from '../organizations/legacyBandBridgeService'

type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>
}

function rows(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return []
  return data.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
}

export async function getMyBandMusicalRoles(
  bandId: string,
  client: RpcClient | null | undefined = supabase,
): Promise<MusicalRole[]> {
  if (!client) return ['other']
  const context = await getLegacyBandOrganizationContext(bandId, client)
  if (!context) return ['other']
  const { data, error } = await client.rpc('get_my_team_musical_functions', { p_team_id: context.teamId })
  if (error) throw new Error(error.message)
  const result = rows(data).map((row) => toMusicalRole(row.musical_function))
  return result.length ? result : ['other']
}

export async function updateMyBandMusicalRoles(
  bandId: string,
  musicalRoles: MusicalRole[],
  client: RpcClient | null | undefined = supabase,
): Promise<MusicalRole[]> {
  if (!client) throw new Error('Supabase não está configurado para o Modo Banda.')
  const context = await getLegacyBandOrganizationContext(bandId, client)
  if (!context) throw new Error('Organização da banda não encontrada.')
  const { data, error } = await client.rpc('set_my_team_musical_functions', {
    p_team_id: context.teamId,
    p_musical_functions: musicalRoles,
  })
  if (error) throw new Error(error.message)
  const result = rows(data).map((row) => toMusicalRole(row.musical_function))
  return result.length ? result : ['other']
}

/** Compatibility API for the current Band UI. */
export async function getMyBandMusicalRole(
  bandId: string,
  client: RpcClient | null | undefined = supabase,
): Promise<MusicalRole> {
  const roles = await getMyBandMusicalRoles(bandId, client)
  return roles[0] ?? 'other'
}

/** Compatibility API for the current Band UI. */
export async function updateMyBandMusicalRole(
  bandId: string,
  musicalRole: MusicalRole,
  client: RpcClient | null | undefined = supabase,
): Promise<MusicalRole> {
  const roles = await updateMyBandMusicalRoles(bandId, [musicalRole], client)
  return roles[0] ?? 'other'
}
