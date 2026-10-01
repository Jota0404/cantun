import { Link } from 'react-router-dom'
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
