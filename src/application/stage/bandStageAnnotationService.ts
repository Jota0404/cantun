import { supabase } from '../../lib/supabase'
import type { BandStageState } from '../../domain/stage/bandStage'
import { toBandStageState } from '../../domain/stage/bandStage'

type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>
}

export const MAX_STAGE_ANNOTATION_LENGTH = 500

export function normalizeBandStageAnnotation(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? ''
  return normalized.length > 0 ? normalized.slice(0, MAX_STAGE_ANNOTATION_LENGTH) : null
}

export async function setMyBandStageAnnotation(
  sessionId: string,
  annotation: string | null | undefined,
  client: RpcClient | null | undefined = supabase,
): Promise<BandStageState> {
  if (!client) throw new Error('Supabase não está configurado para o Modo Banda.')
  const normalized = normalizeBandStageAnnotation(annotation)
  const { data, error } = await client.rpc('band_stage_set_annotation', {
    p_session_id: sessionId,
    p_annotation: normalized,
  })
  if (error) throw new Error(error.message)
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Resposta RPC de anotação inválida.')
  return toBandStageState(row as Record<string, unknown>)
}
