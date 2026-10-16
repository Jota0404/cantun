import { useCallback, useEffect, useState } from 'react'
import { discardRejectedChanges, getSyncStatus, type SyncStatus } from '../../application/sync/syncStatus'
import { onRemoteDataApplied } from '../../application/sync/remoteData'
import { ConfirmModal } from '../ui/ConfirmModal'
import './SyncStatusNotice.css'

const REFRESH_MS = 10_000

export function SyncStatusNotice() {
  const [status, setStatus] = useState<SyncStatus>({ pending: 0, failed: [] })
  const [confirming, setConfirming] = useState(false)

  const refresh = useCallback(async () => { setStatus(await getSyncStatus()) }, [])

  useEffect(() => {
    const first = window.setTimeout(() => { void refresh() }, 0)
    const timer = window.setInterval(() => { void refresh() }, REFRESH_MS)
    const off = onRemoteDataApplied(() => { void refresh() })
    return () => { window.clearTimeout(first); window.clearInterval(timer); off() }
  }, [refresh])

  const failed = status.failed.length
  if (status.pending === 0 && failed === 0) return null

  async function discard() {
    setConfirming(false)
    await discardRejectedChanges()
    await refresh()
  }

  return (
    <div className="sync-notice">
      {status.pending > 0 && <p role="status">{status.pending} alteração(ões) aguardando envio ao servidor.</p>}
      {failed > 0 && <p role="alert">
        {failed} alteração(ões) foram recusadas pelo servidor (sem permissão ou em conflito com outra mudança) e não serão reenviadas.{' '}
        <button type="button" onClick={() => setConfirming(true)}>Descartar alterações recusadas</button>
      </p>}
      <ConfirmModal
        open={confirming}
        title="Descartar alterações recusadas?"
        message="As alterações recusadas feitas neste aparelho serão perdidas. O que está no servidor volta a valer na próxima atualização."
        confirmLabel="Descartar"
        onConfirm={() => void discard()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  )
}
