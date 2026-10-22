import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listMyOrganizations } from '../../application/organizations/organizationService'
import { getRecentActivity } from '../../application/services/activityService'
import { onRemoteDataApplied } from '../../application/sync/remoteData'
import { formatServiceDate } from '../service/serviceLabels'
import './ActivityPanel.css'

type ActivityEvents = Extract<Awaited<ReturnType<typeof getRecentActivity>>, { success: true }>['events']
type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; events: ActivityEvents }

/** Log somente leitura (RN-10): sem ações, contadores ou paginação. */
export function ActivityPanel() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    const load = () => {
      void (async () => {
        const [organization] = await listMyOrganizations()
        if (!organization) return { status: 'ready', events: [] } as State
        const result = await getRecentActivity(organization.id)
        return (result.success ? { status: 'ready', events: result.events } : { status: 'error', message: result.errors[0] ?? 'Não foi possível carregar.' }) as State
      })()
        .catch((): State => ({ status: 'error', message: 'Não foi possível carregar.' }))
        .then((next) => { if (!cancelled) setState(next) })
    }
    load()
    const unsubscribe = onRemoteDataApplied(load)
    return () => { cancelled = true; unsubscribe() }
  }, [])

  return (
    <section className="home-gaps activity-panel" aria-labelledby="home-activity-title">
      <h3 id="home-activity-title">Atividade</h3>
      {state.status === 'loading' && <p role="status" aria-live="polite">Carregando atividade...</p>}
      {state.status === 'error' && <p>{state.message}</p>}
      {state.status === 'ready' && state.events.length === 0 && <p>Sem atividade recente.</p>}
      {state.status === 'ready' && state.events.length > 0 && (
        <ul>
          {state.events.map((event) => (
            <li key={event.id}>
              {event.serviceId ? <Link to={`/services/${event.serviceId}`}>{event.text}</Link> : <span>{event.text}</span>}
              <time dateTime={event.createdAt}>{formatServiceDate(event.createdAt)}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
