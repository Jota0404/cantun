import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listSongs } from '../../application/songs/listSongs'
import { SongList } from '../../components/song/SongList'
import type { Song } from '../../domain/songs/song'
import type { SongRepository } from '../../db/repositories/songRepository'

type SongLibraryPageProps = {
  repository?: SongRepository
}

export function SongLibraryPage({ repository }: SongLibraryPageProps) {
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
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

  return (
    <SongList
      songs={songs}
      onSelectSong={(song) => navigate(`/songs/${song.id}`)}
    />
  )
}
