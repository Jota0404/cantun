import type { EntityName } from './types'
import { db } from '../db/database'
import { supabase } from '../lib/supabase'
import { SyncEngine } from './syncEngine'

export const syncEngine = supabase ? new SyncEngine(db, supabase) : null

export async function queueLocalUpsert(userId: string | null, entity: EntityName, payload: Parameters<SyncEngine['queueUpsert']>[2]) {
  if (!userId || !syncEngine) return
  await syncEngine.queueUpsert(userId, entity, payload)
}

export async function queueLocalDelete(userId: string | null, entity: EntityName, entityId: string) {
  if (!userId || !syncEngine) return
  await syncEngine.queueDelete(userId, entity, entityId)
}
