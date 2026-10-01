import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listSongs } from '../../application/songs/listSongs'
import { SongList } from '../../components/song/SongList'
import type { Song } from '../../domain/songs/song'
import type { SongRepository } from '../../db/repositories/songRepository'
import './SongLibraryPage.css'

type SongLibraryPageProps = {
  repository?: SongRepository
}

export function SongLibraryPage({ repository }: SongLibraryPageProps) {
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false

    async function loadSongs() {
      const result = repository ? await listSongs(repository) : await listSongs()
      if (!cancelled) {
        setSongs(result)
        setLoading(false)
      }
    }

    void loadSongs()
    return () => {
      cancelled = true
    }
  }, [repository])

  if (loading) {
    return <p>Carregando músicas...</p>
  }

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const filteredSongs = normalizedQuery
    ? songs.filter((song) =>
        [song.title, song.artist].some((value) =>
          value?.toLocaleLowerCase().includes(normalizedQuery),
        ),
      )
    : songs

  return (
    <section className="song-library-page">
      <button type="button" onClick={() => navigate('/songs/import')}>
        Importar música (.txt)
      </button>

      <label className="song-library-page__search-label" htmlFor="song-search">
        Buscar músicas
      </label>
      <input
        className="song-library-page__search-input"
        id="song-search"
        type="search"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Buscar por título ou artista"
      />

      {songs.length > 0 && filteredSongs.length === 0 ? (
        <div className="song-list__empty">
          <p>Nenhuma música encontrada para esta busca.</p>
        </div>
      ) : (
        <SongList
          songs={filteredSongs}
          onSelectSong={(song) => navigate(`/songs/${song.id}`)}
        />
      )}
    </section>
  )
}
