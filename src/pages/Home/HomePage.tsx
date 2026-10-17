import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { onRemoteDataApplied } from '../../application/sync/remoteData'
import { getHomeSummary, type HomeSummary } from '../../application/home/getHomeSummary'
import { formatServiceDate, SERVICE_STATUS_LABEL } from '../../components/service/serviceLabels'
import { ASSIGNMENT_STATUS_LABEL, ASSIGNMENT_STATUS_TONE } from '../../components/schedule/scheduleLabels'
import { musicalFunctionLabel } from '../../components/team/musicalFunctions'
import { labels } from '../../ui/labels'
import { Badge } from '../../components/ui/Badge'
import './HomePage.css'

const homeActions = [
  {
    href: '/songs',
    eyebrow: 'Biblioteca',
    title: 'Suas músicas',
    description: 'Encontre, edite e prepare suas cifras em um só lugar.',
    primary: true,
  },
  {
    href: '/repertoires',
    eyebrow: 'Repertórios',
    title: 'Organize seus repertórios',
    description: 'Monte a sequência de músicas para cada culto ou apresentação.',
    primary: false,
  },
  {
    href: '/songs/new',
    eyebrow: 'Criar',
    title: 'Nova música',
    description: 'Cadastre uma cifra personalizada e mantenha tudo no CANTUM.',
    primary: false,
  },
  {
    href: '/songs/import',
    eyebrow: 'Importar',
    title: 'Importar cifra',
    description: 'Traga rapidamente uma música em arquivo .txt.',
    primary: false,
  },
]

export function HomePage() {
  const [summary, setSummary] = useState<HomeSummary>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = () => { void getHomeSummary().then((next) => { if (!cancelled) { setSummary(next); setFailed(false) } }).catch(() => { if (!cancelled) setFailed(true) }) }
    load()
    const unsubscribe = onRemoteDataApplied(load)
    return () => { cancelled = true; unsubscribe() }
  }, [])

  const gaps = summary?.managedGaps ?? []
  const { nextService, pendingConfirmations = [], liveStage } = summary ?? {}

  return (
    <main className="home-page">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero__content">
          <span className="home-hero__badge">SEU WORKSPACE MUSICAL</span>
          <h2 id="home-title">Tudo pronto para a próxima música.</h2>
          <p>
            Organize suas cifras, prepare repertórios e entre no Modo Palco sem perder tempo.
          </p>
        </div>
        <Link className="home-hero__cta" to="/songs">
          Abrir biblioteca
        </Link>
      </section>

      {failed && <p role="alert">Não foi possível carregar.</p>}

      {summary && !summary.hasOrganization && (
        <section className="home-gaps" aria-labelledby="home-onboarding-title">
          <h3 id="home-onboarding-title">Comece pelo seu {labels.organization}</h3>
          <p>Crie ou entre em um {labels.organization} para montar bandas e serviços.</p>
          <Link to="/organizations">Ir para {labels.organizations}</Link>
        </section>
      )}

      {liveStage && (
        <section className="home-gaps" aria-labelledby="home-live-title">
          <h3 id="home-live-title">Palco ao vivo</h3>
          <Link to={`/stage/service-session/${liveStage.stageSessionId}`}>Abrir Modo Palco: {liveStage.service.name}</Link>
        </section>
      )}

      {nextService && (
        <section className="home-gaps" aria-labelledby="home-next-title">
          <h3 id="home-next-title">Próximo serviço</h3>
          <ul>
            <li>
              <Link to={`/services/${nextService.service.id}`}>{nextService.service.name}</Link>
              <span>{formatServiceDate(nextService.service.startsAt)}</span>
              {nextService.service.location && <span>{nextService.service.location}</span>}
              <span>{musicalFunctionLabel(nextService.assignment.musicalFunction)}</span>
              <Badge tone={ASSIGNMENT_STATUS_TONE[nextService.assignment.status]}>{ASSIGNMENT_STATUS_LABEL[nextService.assignment.status]}</Badge>
              <span>Serviço: {SERVICE_STATUS_LABEL[nextService.service.status]}</span>
            </li>
          </ul>
        </section>
      )}

      {pendingConfirmations.length > 0 && (
        <section className="home-gaps" aria-labelledby="home-pending-title">
          <h3 id="home-pending-title">Confirmações pendentes</h3>
          <ul>
            {pendingConfirmations.map(({ assignment, service }) => (
              <li key={assignment.id}>
                <Link to={`/services/${service.id}`}>{service.name}</Link>
                <span>{formatServiceDate(service.startsAt)}</span>
                <span>{musicalFunctionLabel(assignment.musicalFunction)}</span>
                <Badge tone="attention">Aguardando sua resposta</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      {gaps.length > 0 && (
        <section className="home-gaps" aria-labelledby="home-gaps-title">
          <h3 id="home-gaps-title">Escalas com vagas abertas</h3>
          <ul>
            {gaps.map(({ service, openCount, missingTotal }) => (
              <li key={service.id}>
                <Link to={`/services/${service.id}`}>{service.name}</Link>
                <span>{formatServiceDate(service.startsAt)}</span>
                <span>Faltam {missingTotal} pessoa(s) em {openCount} vaga(s)</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="home-actions" aria-labelledby="home-actions-title">
        <div className="home-section-heading">
          <div>
            <span>ACESSO RÁPIDO</span>
            <h3 id="home-actions-title">Comece por aqui</h3>
          </div>
          <p>Os principais caminhos do CANTUM, sem complicação.</p>
        </div>

        <div className="home-actions__grid">
          {homeActions.map((action) => (
            <Link
              key={action.href}
              className={`home-action${action.primary ? ' home-action--primary' : ''}`}
              to={action.href}
            >
              <span className="home-action__eyebrow">{action.eyebrow}</span>
              <span className="home-action__title">{action.title}</span>
              <span className="home-action__description">{action.description}</span>
              <span className="home-action__arrow" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
