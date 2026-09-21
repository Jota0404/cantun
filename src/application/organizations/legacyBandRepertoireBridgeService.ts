import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase as defaultSupabase } from '../../lib/supabase'

export interface LegacyBandSetlistRepertoireContext {
  bandSetlistId: string
  organizationId: string
  repertoireId: string
}

export async function getLegacyBandSetlistRepertoireContext(
  bandSetlistId: string,
  client: SupabaseClient | null = defaultSupabase,
): Promise<LegacyBandSetlistRepertoireContext | null> {
  if (!client) return null

  const { data, error } = await client
    .rpc('get_band_setlist_repertoire_context', { p_band_setlist_id: bandSetlistId })
    .maybeSingle()

  if (error) throw error
  return data as LegacyBandSetlistRepertoireContext | null
}
