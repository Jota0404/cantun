import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSongHistory, type SongHistoryView } from '../../application/services/executionHistoryService'
import { formatServiceDate } from '../service/serviceLabels'
import './SongHistoryPanel.css'

// RN-07/RN-20: histórico derivado, só online.
export function SongHistoryPanel({ songId }: { songId: string }) {
  const [state, setState] = useState<{ id: string; history?: SongHistoryView; error?: string }>()

  useEffect(() => {
    let cancelled = false
    getSongHistory(songId)
      .then((result) => { if (!cancelled) setState({ id: songId, history: result.success ? result.history : undefined, error: result.success ? undefined : result.errors[0] }) })
      .catch(() => { if (!cancelled) setState({ id: songId, error: 'Disponível com conexão.' }) })
    return () => { cancelled = true }
  }, [songId])

  const ready = state?.id === songId ? state : undefined
  const history = ready?.history

  return (
    <section aria-labelledby="song-history-title" className="song-history">
      <h3 id="song-history-title">Histórico</h3>
      <div role="status" aria-live="polite">
        {!ready && <p>Carregando histórico…</p>}
        {ready?.error && <p className="song-history__notice">{ready.error}</p>}
      </div>
      {history && (history.lastPlayedAt === null ? <p>Ainda não tocada em um serviço</p> : <>
        <p>Última vez tocada em {formatServiceDate(history.lastPlayedAt)}</p>
        <p>Tocada {history.playsLast12Months} {history.playsLast12Months === 1 ? 'vez' : 'vezes'} nos últimos 12 meses</p>
        <h4>Tons usados</h4>
        <ul>{history.keys.map((item) => <li key={item.key ?? 'none'}>{item.key ?? 'Sem tom'}: {item.count}</li>)}</ul>
        <h4>Últimos serviços</h4>
        <ul>{history.recent.slice(0, 5).map((item) => (
          <li key={item.serviceId}><Link to={`/services/${item.serviceId}`}>{item.serviceName}</Link> · {formatServiceDate(item.startsAt)}{item.key && ` · Tom ${item.key}`}</li>
        ))}</ul>
      </>)}
    </section>
  )
}
