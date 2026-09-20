import { supabase } from '../../lib/supabase'
import type { StageSession } from '../../domain/stage/stageSession'

function row(data: unknown): Record<string, unknown> {
  const value = Array.isArray(data) ? data[0] : data
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Resposta de sessão de palco inválida.')
  return value as Record<string, unknown>
}

function map(value: Record<string, unknown>): StageSession {
  return {
    id: String(value.id),
    serviceId: String(value.service_id),
    legacyBandStageSessionId: String(value.legacy_band_stage_session_id),
    status: value.status as StageSession['status'],
    createdAt: String(value.created_at),
    startedAt: value.started_at ? String(value.started_at) : undefined,
    endedAt: value.ended_at ? String(value.ended_at) : undefined,
    updatedAt: String(value.updated_at),
  }
}

function client() {
  if (!supabase) throw new Error('Supabase não está configurado.')
  return supabase
}

export async function createStageSession(serviceId: string, id = crypto.randomUUID()): Promise<StageSession> {
  const { data, error } = await client().rpc('create_service_stage_session', { p_service_id: serviceId, p_session_id: id })
  if (error) throw error
  return map(row(data))
}

export async function startStageSession(stageSessionId: string): Promise<StageSession> {
  const { data, error } = await client().rpc('start_service_stage_session', { p_stage_session_id: stageSessionId })
  if (error) throw error
  return map(row(data))
}

export async function endStageSession(stageSessionId: string): Promise<StageSession> {
  const { data, error } = await client().rpc('end_service_stage_session', { p_stage_session_id: stageSessionId })
  if (error) throw error
  return map(row(data))
}

export async function getStageSession(stageSessionId: string): Promise<StageSession> {
  const { data, error } = await client().rpc('get_service_stage_session', { p_stage_session_id: stageSessionId })
  if (error) throw error
  return map(row(data))
}
