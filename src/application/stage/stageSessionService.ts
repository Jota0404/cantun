import { isPlatformConfigured } from '../../platform/http'
import { rpc } from '../../platform/rpc'
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
    mdUserId: value.md_user_id ? String(value.md_user_id) : undefined,
    status: value.status as StageSession['status'],
    createdAt: String(value.created_at),
    startedAt: value.started_at ? String(value.started_at) : undefined,
    endedAt: value.ended_at ? String(value.ended_at) : undefined,
    updatedAt: String(value.updated_at),
  }
}

export async function createStageSession(serviceId: string, id = crypto.randomUUID()): Promise<StageSession> {
  const session = map(row(await rpc('create_target_stage_session', { p_service_id: serviceId, p_session_id: id })))
  await stageSessionRepository.put(session)
  return session
}

export async function startStageSession(stageSessionId: string): Promise<StageSession> {
  await stageSessionStateRepository.put(toStageSessionState(row(await rpc('target_stage_start', { p_stage_session_id: stageSessionId }))))
  return getStageSession(stageSessionId)
}

export async function endStageSession(stageSessionId: string): Promise<StageSession> {
  await stageSessionStateRepository.put(toStageSessionState(row(await rpc('target_stage_end', { p_stage_session_id: stageSessionId }))))
  return getStageSession(stageSessionId)
}

export async function getStageSession(stageSessionId: string): Promise<StageSession> {
  if (!isPlatformConfigured) {
    const local = await stageSessionRepository.getById(stageSessionId)
    if (local) return local
    throw new Error('Sessão de palco não disponível offline.')
  }
  try {
    const session = map(row(await rpc('get_service_stage_session', { p_stage_session_id: stageSessionId })))
    await stageSessionRepository.put(session)
    return session
  } catch (error) {
    const local = await stageSessionRepository.getById(stageSessionId)
    if (local) return local
    throw error
  }
}
