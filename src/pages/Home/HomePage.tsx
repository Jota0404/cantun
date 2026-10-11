import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { onRemoteDataApplied } from '../../application/sync/remoteData'
import { listManagedServiceGaps, type ManagedServiceGap } from '../../application/services/scheduleService'
import { formatServiceDate } from '../../components/service/serviceLabels'
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
  const [gaps, setGaps] = useState<ManagedServiceGap[]>([])

  useEffect(() => {
    let cancelled = false
    const load = () => { void listManagedServiceGaps().then((next) => { if (!cancelled) setGaps(next) }).catch(() => undefined) }
    load()
    const unsubscribe = onRemoteDataApplied(load)
    return () => { cancelled = true; unsubscribe() }
  }, [])

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
