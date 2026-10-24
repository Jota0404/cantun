import { Link, useLocation } from 'react-router-dom'
import { Icon, type IconName } from '../ui/Icon'
import { labels } from '../../ui/labels'
import './AppNav.css'

// RN-01: destinos principais, nesta ordem. Sempre com texto (RN-03).
const DESTINATIONS: Array<{ to: string; label: string; icon: IconName; match: (path: string) => boolean }> = [
  { to: '/', icon: 'home', label: 'Início', match: (path) => path === '/' },
  { to: '/servicos', icon: 'services', label: 'Serviços', match: (path) => path.startsWith('/servicos') || path.startsWith('/meus-servicos') || path.startsWith('/services/') },
  { to: '/songs', icon: 'music', label: 'Músicas', match: (path) => path.startsWith('/songs') },
  { to: '/bandas', icon: 'bands', label: labels.teams, match: (path) => path.startsWith('/bandas') || path.startsWith('/organizations') },
  { to: '/mais', icon: 'more', label: 'Mais', match: (path) => path.startsWith('/mais') || path.startsWith('/repertoires') },
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
              <span className="app-nav__icon"><Icon name={destination.icon} /></span>
              <span>{destination.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
