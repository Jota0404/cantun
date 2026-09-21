import { supabase } from '../../lib/supabase'
import type { StageSession } from '../../domain/stage/stageSession'
import { stageSessionRepository } from '../../db/repositories/stageSessionRepository'
import { stageSessionStateRepository } from '../../db/repositories/stageSessionStateRepository'
import { toStageSessionState } from '../../domain/stage/stageSessionState'

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
  const session = map(row(data))
  await stageSessionRepository.put(session)
  return session
}

export async function startStageSession(stageSessionId: string): Promise<StageSession> {
  const { data, error } = await client().rpc('start_service_stage_session', { p_stage_session_id: stageSessionId })
  if (error) throw error
  await stageSessionStateRepository.put(toStageSessionState(row(data)))
  return getStageSession(stageSessionId)
}

export async function endStageSession(stageSessionId: string): Promise<StageSession> {
  const { data, error } = await client().rpc('end_service_stage_session', { p_stage_session_id: stageSessionId })
  if (error) throw error
  await stageSessionStateRepository.put(toStageSessionState(row(data)))
  return getStageSession(stageSessionId)
}

export async function getStageSession(stageSessionId: string): Promise<StageSession> {
  if (!supabase) {
    const local = await stageSessionRepository.getById(stageSessionId)
    if (local) return local
    throw new Error('Sessão de palco não disponível offline.')
  }
  try {
    const { data, error } = await client().rpc('get_service_stage_session', { p_stage_session_id: stageSessionId })
    if (error) throw error
    const session = map(row(data))
    await stageSessionRepository.put(session)
    return session
  } catch (error) {
    const local = await stageSessionRepository.getById(stageSessionId)
    if (local) return local
    throw error
  }
}
