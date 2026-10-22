import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listServices } from '../../application/services/serviceService'
import { onRemoteDataApplied } from '../../application/sync/remoteData'
import type { Service } from '../../domain/services/service'
import { formatServiceDate } from './serviceLabels'

// Realizados: concluídos, mais recentes primeiro (Dexie local, funciona offline).
export function CompletedServicesPanel({ organizationId }: { organizationId: string }) {
  const [services, setServices] = useState<Service[]>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { past } = await listServices(organizationId)
        if (!cancelled) { setServices(past.filter((s) => s.status === 'completed')); setFailed(false) }
      } catch { if (!cancelled) setFailed(true) }
    }
    void load()
    const off = onRemoteDataApplied(() => { void load() })
    return () => { cancelled = true; off() }
  }, [organizationId])

  return (
    <section aria-labelledby="completed-title">
      <h3 id="completed-title">Realizados</h3>
      <div role="status" aria-live="polite">{!services && !failed && <p>Carregando…</p>}</div>
      {failed && <p role="alert">Não foi possível carregar os serviços realizados.</p>}
      {services && (services.length === 0 ? <p>Nenhum serviço realizado.</p> : (
        <ul>{services.map((s) => <li key={s.id}><Link to={`/services/${s.id}`}>{s.name}</Link> · {formatServiceDate(s.startsAt)}</li>)}</ul>
      ))}
    </section>
  )
}
