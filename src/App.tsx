import './App.css'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { NewSongPage } from './pages/Song/NewSongPage'
import { SongDetailPage } from './pages/Song/SongDetailPage'
import { EditSongPage } from './pages/Song/EditSongPage'
import { SongLibraryPage } from './pages/Song/SongLibraryPage'
import { RepertoireListPage } from './pages/Repertoire/RepertoireListPage'
import { RepertoireDetailPage } from './pages/Repertoire/RepertoireDetailPage'
import { StagePage } from './pages/Stage/StagePage'

function App() {
  const location = useLocation()
  const isStageMode = location.pathname.startsWith('/stage/')

  return (
    <div className={`shell${isStageMode ? ' shell--stage' : ''}`}>
      {!isStageMode && (
        <>
          <h1>Salmodia</h1>
          <nav aria-label="Navegação principal">
            <Link to="/songs">Biblioteca</Link>
            <Link to="/songs/new">Nova música</Link>
            <Link to="/repertoires">Repertórios</Link>
          </nav>
        </>
      )}

      <Routes>
        <Route path="/songs" element={<SongLibraryPage />} />
        <Route path="/repertoires" element={<RepertoireListPage />} />
        <Route
          path="/repertoires/:repertoireId"
          element={<RepertoireDetailPage />}
        />
        <Route
          path="/stage/setlist/:setlistId"
          element={<StagePage />}
        />
        <Route
          path="/stage/song/:songId"
          element={<StagePage />}
        />
        <Route path="/songs/new" element={<NewSongPage />} />
        <Route
          path="/songs/:songId/edit"
          element={<EditSongPage />}
        />
        <Route
          path="/songs/:songId"
          element={<SongDetailPage />}
        />
        <Route path="*" element={<Navigate to="/songs" replace />} />
      </Routes>
    </div>
  )
}

export default App