import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase as defaultSupabase } from '../../lib/supabase'

export interface LegacyBandSongOrganizationContext {
  bandSongId: string
  organizationId: string
  songId: string
}

export async function getLegacyBandSongOrganizationContext(
  bandSongId: string,
  client: SupabaseClient | null = defaultSupabase,
): Promise<LegacyBandSongOrganizationContext | null> {
  if (!client) return null

  const { data, error } = await client
    .rpc('get_band_song_organization_song', { p_band_song_id: bandSongId })
    .maybeSingle()

  if (error) throw error
  return data as LegacyBandSongOrganizationContext | null
}
