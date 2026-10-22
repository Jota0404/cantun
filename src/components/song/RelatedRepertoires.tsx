import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listRepertoiresWithSong } from '../../application/services/executionHistoryService'

// RN-08: lido do Dexie local, funciona offline.
export function RelatedRepertoires({ songId, organizationId }: { songId: string; organizationId: string }) {
  const [state, setState] = useState<{ id: string; items: { id: string; name: string }[] }>()
  useEffect(() => {
    let cancelled = false
    listRepertoiresWithSong(songId, organizationId)
      .then((items) => { if (!cancelled) setState({ id: songId, items }) })
      .catch(() => { if (!cancelled) setState({ id: songId, items: [] }) })
    return () => { cancelled = true }
  }, [songId, organizationId])
  const items = state?.id === songId ? state.items : undefined
  return (
    <section aria-labelledby="related-repertoires-title">
      <h3 id="related-repertoires-title">Repertórios relacionados</h3>
      <div role="status" aria-live="polite">{!items && <p>Carregando…</p>}</div>
      {items && (items.length === 0 ? <p>Nenhum repertório usa esta música.</p> : (
        <ul>{items.map((r) => <li key={r.id}><Link to={`/organizations/${organizationId}/repertoires/${r.id}`}>{r.name}</Link></li>)}</ul>
      ))}
    </section>
  )
}
