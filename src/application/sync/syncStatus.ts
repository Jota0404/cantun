import { targetSyncEngine } from '../../sync/syncService'
import type { SyncStatus } from '../../sync/targetSyncEngine'

export type { SyncStatus }

const EMPTY: SyncStatus = { pending: 0, failed: [] }

export function getSyncStatus(): Promise<SyncStatus> {
  return targetSyncEngine ? targetSyncEngine.getStatus() : Promise.resolve(EMPTY)
}

/** Descarta as alterações que o servidor recusou. A UI só chama depois de confirmação do usuário. */
export async function discardRejectedChanges(): Promise<void> {
  await targetSyncEngine?.discardFailed()
}
