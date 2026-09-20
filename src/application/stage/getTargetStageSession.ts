import { supabase } from '../../lib/supabase'

export type TargetStageSession = {
  id: string
  serviceId: string
  legacyBandStageSessionId: string
  status: 'lobby' | 'live' | 'ended'
}

export async function getTargetStageSessionByLegacyId(legacySessionId: string): Promise<TargetStageSession | undefined> {
  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data, error } = await supabase.rpc('get_stage_session_by_legacy_id', {
    p_legacy_session_id: legacySessionId,
  })
  if (error) throw error
  const value = Array.isArray(data) ? data[0] : data
  if (!value || typeof value !== 'object') return undefined
  const row = value as Record<string, unknown>
  return {
    id: String(row.id),
    serviceId: String(row.service_id),
    legacyBandStageSessionId: String(row.legacy_band_stage_session_id),
    status: row.status as TargetStageSession['status'],
  }
}
