import { Link, useLocation } from 'react-router-dom'
import { labels } from '../../ui/labels'
import './AppNav.css'

// RN-01: destinos principais, nesta ordem. Sempre com texto (RN-03).
const DESTINATIONS = [
  { to: '/', label: 'Início', match: (path: string) => path === '/' },
  { to: '/servicos', label: 'Serviços', match: (path: string) => path.startsWith('/servicos') || path.startsWith('/meus-servicos') || path.startsWith('/services/') },
  { to: '/songs', label: 'Músicas', match: (path: string) => path.startsWith('/songs') },
  { to: '/bandas', label: labels.teams, match: (path: string) => path.startsWith('/bandas') || path.startsWith('/organizations') },
  { to: '/mais', label: 'Mais', match: (path: string) => path.startsWith('/mais') || path.startsWith('/repertoires') },
]

/** Barra inferior no celular (< 900 px) e lateral a partir de 900 px (CSS). `aria-current` marca o destino ativo. */
export function AppNav() {
  const { pathname } = useLocation()
  return (
    <nav className="app-nav" aria-label="Navegação principal">
      <ul>
        {DESTINATIONS.map((destination) => (
          <li key={destination.to}>
            <Link to={destination.to} aria-current={destination.match(pathname) ? 'page' : undefined}>
              {destination.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
