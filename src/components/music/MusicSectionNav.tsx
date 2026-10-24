import { Link } from 'react-router-dom'
import './MusicSectionNav.css'

/** Título "Músicas" e navegação segmentada Biblioteca | Repertórios (ADR-066). */
export function MusicSectionNav({ current }: { current: 'library' | 'repertoires' }) {
  return (
    <div className="music-section-nav">
      <h2>Músicas</h2>
      <nav aria-label="Seções de músicas">
        <Link to="/songs" aria-current={current === 'library' ? 'page' : undefined}>Biblioteca</Link>
        <Link to="/repertoires" aria-current={current === 'repertoires' ? 'page' : undefined}>Repertórios</Link>
      </nav>
    </div>
  )
}
