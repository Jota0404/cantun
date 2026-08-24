import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SongDetail } from '../../components/song/SongDetail'
import { getSongById } from '../../application/songs/getSongById'
import type { Song } from '../../domain/songs/song'
import type { SongRepository } from '../../db/repositories/songRepository'
import './SongDetailPage.css'

type SongDetailPageProps = {
  repository?: SongRepository
}

export function SongDetailPage({ repository }: SongDetailPageProps) {
  const { songId } = useParams<{ songId: string }>()
  const navigate = useNavigate()
  const [song, setSong] = useState<Song | undefined>()
  const [loadedSongId, setLoadedSongId] = useState<string | undefined>()

  useEffect(() => {
    let cancelled = false

    async function loadSong() {
      if (!songId) {
        if (!cancelled) {
          setSong(undefined)
          setLoadedSongId(songId)
        }
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
  }, [songId, repository])

  if (songId && loadedSongId !== songId) {
    return (
      <section className="song-detail-page">
        <p>Carregando música...</p>
      </section>
    )
  }

  if (!song) {
    return (
      <section className="song-detail-page">
        <h2>Música não encontrada.</h2>
        <p>A música solicitada não existe.</p>
      </section>
    )
  }

  return (
    <section className="song-detail-page">
      <SongDetail song={song} onEdit={() => navigate(`/songs/${song.id}/edit`)} />
    </section>
  )
}
