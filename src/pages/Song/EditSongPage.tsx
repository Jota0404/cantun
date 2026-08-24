import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getSongById } from '../../application/songs/getSongById'
import { SongForm } from '../../components/song/SongForm'
import type { SongRepository } from '../../db/repositories/songRepository'
import type { Song } from '../../domain/songs/song'
import './NewSongPage.css'

type EditSongPageProps = {
  repository?: SongRepository
}

export function EditSongPage({ repository }: EditSongPageProps) {
  const { songId } = useParams<{ songId: string }>()
  const navigate = useNavigate()
  const [song, setSong] = useState<Song | undefined>()
  const [loadedSongId, setLoadedSongId] = useState<string | undefined>()

  useEffect(() => {
    let cancelled = false

    async function loadSong() {
      if (!songId) {
        return
      }

      const result = repository
        ? await getSongById(songId, repository)
        : await getSongById(songId)

      if (!cancelled) {
        setSong(result)
        setLoadedSongId(songId)
      }
    }

    void loadSong()
    return () => {
      cancelled = true
    }
  }, [repository, songId])

  if (songId && loadedSongId !== songId) {
    return <section className="new-song-page"><p>Carregando música...</p></section>
  }

  if (!song) {
    return <section className="new-song-page"><h2>Música não encontrada.</h2></section>
  }

  return (
    <section className="new-song-page">
      <h2>Editar música</h2>
      <SongForm song={song} onSuccess={(updatedSong) => navigate(`/songs/${updatedSong.id}`)} />
    </section>
  )
}
