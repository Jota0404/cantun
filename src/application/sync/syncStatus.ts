import { syncEngine, targetSyncEngine } from '../../sync/syncService'
import type { SyncStatus } from '../../sync/targetSyncEngine'

export type { SyncStatus }

/** Soma as duas filas (alvos e músicas pessoais): um só contador e um só aviso. */
export async function getSyncStatus(): Promise<SyncStatus> {
  const parts = await Promise.all([targetSyncEngine?.getStatus(), syncEngine?.getStatus()])
  return parts.reduce<SyncStatus>((total, part) => part ? { pending: total.pending + part.pending, failed: [...total.failed, ...part.failed] } : total, { pending: 0, failed: [] })
}

/** Descarta as alterações que o servidor recusou. A UI só chama depois de confirmação do usuário. */
export async function discardRejectedChanges(): Promise<void> {
  await syncEngine?.discardFailed()
  await targetSyncEngine?.discardFailed()
}
