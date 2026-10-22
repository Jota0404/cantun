import { useEffect, useState } from 'react'
import { getServiceExecution, type ServiceExecutionView } from '../../application/services/executionHistoryService'
import { musicalFunctionLabel } from '../team/musicalFunctions'
import { formatServiceDate } from './serviceLabels'
import './ExecutionRecordPanel.css'

function duration(start: string, end: string): string {
  const minutes = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000))
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`
}

// RN-18/RN-20: leitura só online; userId nulo = conta excluída.
export function ExecutionRecordPanel({ serviceId }: { serviceId: string }) {
  const [state, setState] = useState<{ id: string; execution: ServiceExecutionView | null; error?: string }>()

  useEffect(() => {
    let cancelled = false
    getServiceExecution(serviceId)
      .then((result) => { if (!cancelled) setState({ id: serviceId, execution: result.success ? result.execution : null, error: result.success ? undefined : result.errors[0] }) })
      .catch(() => { if (!cancelled) setState({ id: serviceId, execution: null, error: 'Disponível com conexão.' }) })
    return () => { cancelled = true }
  }, [serviceId])

  const ready = state?.id === serviceId ? state : undefined
  const execution = ready?.execution

  return (
    <section aria-labelledby="execution-title" className="execution-panel">
      <h3 id="execution-title">Registro da execução</h3>
      <div role="status" aria-live="polite">
        {!ready && <p>Carregando registro…</p>}
        {ready?.error && <p className="execution-panel__notice">{ready.error}</p>}
        {ready && !ready.error && !execution && <p>Este serviço não tem registro de execução.</p>}
      </div>
      {execution && <>
        <p>Concluído em {formatServiceDate(execution.completedAt)}</p>
        {execution.stageStartedAt && execution.stageEndedAt && <p>Duração do Palco: {duration(execution.stageStartedAt, execution.stageEndedAt)}</p>}
        <h4>Músicas tocadas</h4>
        {execution.songs.length === 0 ? <p>Nenhuma música registrada.</p> : (
          <ol>{execution.songs.map((song) => (
            <li key={song.position}>{song.title}{song.artist && ` — ${song.artist}`}{song.key && ` · Tom ${song.key}`}</li>
          ))}</ol>
        )}
        <h4>Equipe confirmada</h4>
        {execution.members.length === 0 ? <p>Nenhum membro confirmado.</p> : (
          <ul>{execution.members.map((member, index) => (
            <li key={index}>{member.userId ? member.name : 'Ex-membro'} · {musicalFunctionLabel(member.musicalFunction)}</li>
          ))}</ul>
        )}
      </>}
    </section>
  )
}
