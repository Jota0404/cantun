import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { HomePage } from './pages/Home/HomePage'
import { NewSongPage } from './pages/Song/NewSongPage'
import { ImportSongPage } from './pages/Song/ImportSongPage'
import { SongDetailPage } from './pages/Song/SongDetailPage'
import { EditSongPage } from './pages/Song/EditSongPage'
import { SongLibraryPage } from './pages/Song/SongLibraryPage'
import { RepertoireListPage } from './pages/Repertoire/RepertoireListPage'
import { RepertoireDetailPage } from './pages/Repertoire/RepertoireDetailPage'
import { StagePage } from './pages/Stage/StagePage'
import './App.css'

type Theme = 'light' | 'dark'

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const saved = window.localStorage.getItem('cantum-theme')
  return saved === 'dark' ? 'dark' : 'light'
}

function App() {
  const location = useLocation()
  const isStageMode = location.pathname.startsWith('/stage/')
  const isHome = location.pathname === '/'
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('cantum-theme', theme)
  }, [theme])

  return (
    <div className={`shell${isStageMode ? ' shell--stage' : ''}`}>
      {!isStageMode && (
        <>
          <header className="app-header">
            <div>
              <p className="app-header__eyebrow">MUSIC WORKSPACE</p>
              <h1><Link to="/">CANTUM</Link></h1>
            </div>
            <button
              type="button"
              className="app-header__theme"
              onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
              aria-label={`Ativar modo ${theme === 'light' ? 'escuro' : 'claro'}`}
            >
              {theme === 'light' ? 'Modo escuro' : 'Modo claro'}
            </button>
          </header>
          {!isHome && (
            <nav aria-label="Navegação principal">
              <Link to="/songs">Biblioteca</Link>
              <Link to="/songs/new">Nova música</Link>
              <Link to="/songs/import">Importar música</Link>
              <Link to="/repertoires">Repertórios</Link>
            </nav>
          )}
        </>
      )}

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/songs" element={<SongLibraryPage />} />
        <Route path="/repertoires" element={<RepertoireListPage />} />
        <Route path="/repertoires/:repertoireId" element={<RepertoireDetailPage />} />
        <Route path="/stage/setlist/:setlistId" element={<StagePage />} />
        <Route path="/stage/song/:songId" element={<StagePage />} />
        <Route path="/songs/new" element={<NewSongPage />} />
        <Route path="/songs/import" element={<ImportSongPage />} />
        <Route path="/songs/:songId/edit" element={<EditSongPage />} />
        <Route path="/songs/:songId" element={<SongDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default App
