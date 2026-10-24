import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { onRemoteDataApplied } from '../../application/sync/remoteData'
import { getHomeSummary, type HomeSummary } from '../../application/home/getHomeSummary'
import { confirmAssignment, declineAssignment } from '../../application/services/scheduleService'
import { formatServiceDate, SERVICE_STATUS_LABEL } from '../../components/service/serviceLabels'
import { ASSIGNMENT_STATUS_LABEL, ASSIGNMENT_STATUS_TONE, OFFLINE_MESSAGE } from '../../components/schedule/scheduleLabels'
import { useOnline } from '../../components/schedule/useOnline'
import { musicalFunctionLabel } from '../../components/team/musicalFunctions'
import { labels } from '../../ui/labels'
import { ActivityPanel } from '../../components/home/ActivityPanel'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import './HomePage.css'

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

export function HomePage() {
  const navigate = useNavigate()
  const online = useOnline()
  const [summary, setSummary] = useState<HomeSummary>()
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = () => { void getHomeSummary().then((next) => { if (!cancelled) { setSummary(next); setFailed(false) } }).catch(() => { if (!cancelled) setFailed(true) }) }
    load()
    const unsubscribe = onRemoteDataApplied(load)
    return () => { cancelled = true; unsubscribe() }
  }, [reloadKey])

  // Mesmos casos de uso de "Meus serviços"; depois de responder, recarrega o resumo.
  async function respond(call: (id: string) => Promise<{ success: true } | { success: false; errors: string[] }>, assignmentId: string) {
    setError('')
    if (!online) { setError(OFFLINE_MESSAGE); return }
    setBusy(true)
    try {
      const result = await call(assignmentId)
      if (!result.success) { setError(result.errors.join(' ')); return }
      setReloadKey((key) => key + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.')
    } finally {
      setBusy(false)
    }
  }

  const gaps = summary?.managedGaps ?? []
  const { nextService, pendingConfirmations = [], liveStage } = summary ?? {}
  const missingTotal = gaps.reduce((sum, gap) => sum + gap.missingTotal, 0)
  const nothingPending = !!summary?.hasOrganization && !liveStage && !nextService && pendingConfirmations.length === 0 && gaps.length === 0

  return (
    <main className="home-page">
      <h2 className="home-page__title">Início</h2>
      {failed && <p role="alert">Não foi possível carregar.</p>}
      {error && <p role="alert">{error}</p>}

      {summary && !summary.hasOrganization && (
        <Card role="region" aria-labelledby="home-onboarding-title">
          <h3 id="home-onboarding-title">Comece pelo seu {labels.organization}</h3>
          <p>Crie ou entre em um {labels.organization} para montar bandas e serviços.</p>
          <Button variant="primary" onClick={() => navigate('/bandas')}>Criar meu {labels.organization}</Button>
        </Card>
      )}

      {liveStage && (
        <Card role="region" aria-labelledby="home-live-title">
          <span className="home-live"><span aria-hidden="true">●</span> AO VIVO</span>
          <h3 id="home-live-title">Palco ao vivo</h3>
          <p>{liveStage.service.name}</p>
          <Button variant="primary" onClick={() => navigate(`/stage/service-session/${liveStage.stageSessionId}`)}>Abrir Palco</Button>
        </Card>
      )}

      {pendingConfirmations.length > 0 && (
        <Card role="region" aria-labelledby="home-pending-title" className="home-pending">
          <h3 id="home-pending-title">Convites pendentes</h3>
          {!online && <p role="status">{OFFLINE_MESSAGE}</p>}
          <ul className="home-list">
            {pendingConfirmations.map(({ assignment, service }) => (
              <li key={assignment.id}>
                <div className="home-list__info">
                  <Link to={`/services/${service.id}`}>{service.name}</Link>
                  <span>{formatServiceDate(service.startsAt)}</span>
                  <span>{musicalFunctionLabel(assignment.musicalFunction)}</span>
                </div>
                <div className="home-list__actions">
                  <Button variant="primary" disabled={busy || !online} aria-label={`Confirmar presença em ${service.name}`} onClick={() => void respond(confirmAssignment, assignment.id)}>Confirmar</Button>
                  <Button disabled={busy || !online} aria-label={`Recusar convite de ${service.name}`} onClick={() => void respond(declineAssignment, assignment.id)}>Recusar</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {nextService && (
        <Card role="region" aria-labelledby="home-next-title">
          <h3 id="home-next-title">Próximo serviço</h3>
          <p><Link to={`/services/${nextService.service.id}`}>{nextService.service.name}</Link></p>
          <p className="home-meta">
            <span>{formatServiceDate(nextService.service.startsAt)}</span>
            {nextService.service.location && <span>{nextService.service.location}</span>}
            <span>{musicalFunctionLabel(nextService.assignment.musicalFunction)}</span>
          </p>
          <p className="home-meta">
            <Badge tone={ASSIGNMENT_STATUS_TONE[nextService.assignment.status]}>{ASSIGNMENT_STATUS_LABEL[nextService.assignment.status]}</Badge>
            <span>Serviço: {SERVICE_STATUS_LABEL[nextService.service.status]}</span>
          </p>
          <div className="home-list__actions">
            <Button onClick={() => navigate(`/services/${nextService.service.id}/prepare`)}>Preparar</Button>
            <Button variant="ghost" onClick={() => navigate(`/services/${nextService.service.id}`)}>Ver serviço</Button>
          </div>
        </Card>
      )}

      {gaps.length > 0 && (
        <Card role="region" aria-labelledby="home-gaps-title">
          <h3 id="home-gaps-title">Vagas abertas</h3>
          <p>{plural(missingTotal, 'vaga', 'vagas')} em {plural(gaps.length, 'serviço', 'serviços')}</p>
          <ul className="home-list">
            {gaps.map(({ service, openCount, missingTotal: missing }) => (
              <li key={service.id}>
                <div className="home-list__info">
                  <Link to={`/services/${service.id}`}>{service.name}</Link>
                  <span>{formatServiceDate(service.startsAt)}</span>
                  <span>{missing === 1 ? 'Falta 1 pessoa' : `Faltam ${missing} pessoas`} em {plural(openCount, 'vaga', 'vagas')}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {summary?.hasOrganization && <ActivityPanel />}

      {nothingPending && (
        <Card>
          <p>Nada pendente por aqui.</p>
          <p><Link to="/servicos">Ver Serviços</Link></p>
        </Card>
      )}
    </main>
  )
}
