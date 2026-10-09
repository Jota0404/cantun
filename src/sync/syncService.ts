import type { EntityName } from './types'
import { db } from '../db/database'
import { isPlatformConfigured } from '../platform/http'
import { SyncEngine } from './syncEngine'
import { TargetSyncEngine, type TargetWritableEntity, type TargetWritableEntityName } from './targetSyncEngine'

export const syncEngine = isPlatformConfigured ? new SyncEngine(db) : null
export const targetSyncEngine = isPlatformConfigured ? new TargetSyncEngine(db) : null

export async function queueLocalUpsert(userId: string | null, entity: EntityName, payload: Parameters<SyncEngine['queueUpsert']>[2]) {
  if (!userId || !syncEngine) return
  await syncEngine.queueUpsert(userId, entity, payload)
}

export async function queueLocalDelete(userId: string | null, entity: EntityName, entityId: string, updatedAt?: string) {
  if (!userId || !syncEngine) return
  await syncEngine.queueDelete(userId, entity, entityId, updatedAt)
}

export async function queueTargetUpsert(entity: TargetWritableEntityName, payload: TargetWritableEntity) {
  if (!targetSyncEngine) return
  await targetSyncEngine.queueUpsert(entity, payload)
}

export async function queueTargetDelete(entity: TargetWritableEntityName, entityId: string, updatedAt?: string) {
  if (!targetSyncEngine) return
  await targetSyncEngine.queueDelete(entity, entityId, updatedAt)
}

export async function syncTargetDomain() {
  if (!targetSyncEngine) return
  await targetSyncEngine.sync()
}
