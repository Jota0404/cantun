import { supabase } from '../../lib/supabase'

export interface LegacyBandOrganizationContext {
  bandId: string
  organizationId: string
  teamId: string
}

type RpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>
}

function singleRow(data: unknown): Record<string, unknown> | null {
  const row = Array.isArray(data) ? data[0] : data
  return row && typeof row === 'object' && !Array.isArray(row)
    ? row as Record<string, unknown>
    : null
}

/**
 * Temporary bridge while Band remains operational.
 * The service deliberately resolves the target Organization/Team through
 * the server-side migration mapping instead of relying on ID conventions.
 */
export async function getLegacyBandOrganizationContext(
  bandId: string,
  client: RpcClient | null | undefined = supabase,
): Promise<LegacyBandOrganizationContext | null> {
  if (!client) return null

  const { data, error } = await client.rpc('get_band_organization_context', {
    p_band_id: bandId,
  })

  if (error) throw new Error(error.message)

  const row = singleRow(data)
  if (!row) return null

  return {
    bandId: row.band_id as string,
    organizationId: row.organization_id as string,
    teamId: row.team_id as string,
  }
}
