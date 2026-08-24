import './App.css'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { NewSongPage } from './pages/Song/NewSongPage'
import { SongDetailPage } from './pages/Song/SongDetailPage'
import { EditSongPage } from './pages/Song/EditSongPage'
import { SongLibraryPage } from './pages/Song/SongLibraryPage'

function App() {
  return (
    <div className="shell">
      <h1>Salmodia</h1>
      <nav aria-label="Navegação principal">
        <Link to="/songs">Biblioteca</Link>
        <Link to="/songs/new">Nova música</Link>
      </nav>
      <Routes>
        <Route path="/songs" element={<SongLibraryPage />} />
        <Route path="/songs/new" element={<NewSongPage />} />
        <Route path="/songs/:songId/edit" element={<EditSongPage />} />
        <Route path="/songs/:songId" element={<SongDetailPage />} />
        <Route path="*" element={<Navigate to="/songs" replace />} />
      </Routes>
    </div>
  )
}

export default App
