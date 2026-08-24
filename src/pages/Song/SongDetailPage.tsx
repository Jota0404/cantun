import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SongDetail } from '../../components/song/SongDetail'
import { deleteSong } from '../../application/songs/deleteSong'
import { getSongById } from '../../application/songs/getSongById'
import { updateSong } from '../../application/songs/updateSong'
import { transposeSong } from '../../application/songs/transposeSong'
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
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | undefined>()
  const [isUpdatingFavorite, setIsUpdatingFavorite] = useState(false)
  const [favoriteError, setFavoriteError] = useState<string | undefined>()
  const [isTransposing, setIsTransposing] = useState(false)
  const [transposeError, setTransposeError] = useState<string | undefined>()

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

  async function handleDelete() {
    if (!songId || !window.confirm('Deseja excluir esta música?')) {
      return
    }

    setDeleteError(undefined)
    setIsDeleting(true)

    try {
      const result = repository
        ? await deleteSong(songId, repository)
        : await deleteSong(songId)

      if (!result.success) {
        setDeleteError(result.error.message)
        return
      }

      navigate('/songs')
    } catch {
      setDeleteError('Não foi possível excluir a música. Tente novamente.')
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleTranspose(semitones: number) {
    if (!song) return
    setTransposeError(undefined)
    setIsTransposing(true)
    try {
      const result = repository
        ? await transposeSong({ id: song.id, semitones }, repository)
        : await transposeSong({ id: song.id, semitones })
      if (!result.success) {
        setTransposeError(result.error.message)
        return
      }
      setSong(result.song)
    } catch {
      setTransposeError('Não foi possível transpor a música. Tente novamente.')
    } finally {
      setIsTransposing(false)
    }
  }

  async function handleToggleFavorite() {
    if (!song) {
      return
    }

    const currentSong = song
    setFavoriteError(undefined)
    setIsUpdatingFavorite(true)

    try {
      const result = repository
        ? await updateSong(
            { ...currentSong, isFavorite: !currentSong.isFavorite },
            repository,
          )
        : await updateSong({
            ...currentSong,
            isFavorite: !currentSong.isFavorite,
          })

      if (!result.success) {
        setFavoriteError('Não foi possível atualizar os favoritos. Tente novamente.')
        return
      }

      setSong(result.song)
    } catch {
      setFavoriteError('Não foi possível atualizar os favoritos. Tente novamente.')
    } finally {
      setIsUpdatingFavorite(false)
    }
  }

  return (
    <section className="song-detail-page">
      <SongDetail
        song={song}
        onEdit={() => navigate(`/songs/${song.id}/edit`)}
        onDelete={handleDelete}
        isDeleting={isDeleting}
        onToggleFavorite={handleToggleFavorite}
        onTranspose={handleTranspose}
        isTransposing={isTransposing}
        isUpdatingFavorite={isUpdatingFavorite}
        onStage={() => navigate(`/stage/song/${song.id}`)}
      />
      {deleteError && <p role="alert">{deleteError}</p>}
      {favoriteError && <p role="alert">{favoriteError}</p>}
      {transposeError && <p role="alert">{transposeError}</p>}
    </section>
  )
}
