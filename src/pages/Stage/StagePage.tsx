import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getStageSong } from '../../application/stage/getStageSong'
import { getStageSongs } from '../../application/stage/getStageSongs'
import { getSemitoneDistance, transposeSongLyrics } from '../../domain/music/transpose'
import type { Song } from '../../domain/songs/song'
import './StagePage.css'

type StagePageProps = {
  repository?: Parameters<typeof getStageSong>[1]
  setlistSongRepository?: Parameters<typeof getStageSongs>[1]['setlistSongs']
}

export function StagePage({ repository, setlistSongRepository }: StagePageProps) {
  const { setlistId, songId } = useParams<{ setlistId?: string; songId?: string }>()
  const navigate = useNavigate()
  const isSetlistMode = Boolean(setlistId) && !songId
  const [songs, setSongs] = useState<Song[]>([])
  const [currentSong, setCurrentSong] = useState<Song | undefined>()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [fontSize, setFontSize] = useState(22)
  const [error, setError] = useState<string>()
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setError(undefined)
      if (isSetlistMode && setlistId) {
        const result = await getStageSongs(setlistId, {
          songs: repository,
          setlistSongs: setlistSongRepository,
        })
        if (!cancelled) {
          const loadedSongs = result.map(({ song }) => song)
          setSongs(loadedSongs)
          setCurrentSong(loadedSongs[0])
          setCurrentIndex(0)
        }
        return
      }

      if (songId) {
        const song = await getStageSong(songId, repository)
        if (!cancelled) {
          setSongs(song ? [song] : [])
          setCurrentSong(song)
          setCurrentIndex(0)
        }
        return
      }

      if (!cancelled) setError('Música não informada.')
    }

    void load().catch(() => {
      if (!cancelled) setError('Não foi possível carregar o Modo Palco.')
    })

    return () => {
      cancelled = true
    }
  }, [isSetlistMode, repository, setlistId, setlistSongRepository, songId])

  useEffect(() => {
    if (!currentSong) return
    window.scrollTo({ top: 0 })
  }, [currentSong])

  const displayedLyrics = useMemo(() => {
    if (!currentSong) return ''
    const semitones = getSemitoneDistance(currentSong.originalKey, currentSong.currentKey)
    return transposeSongLyrics(currentSong.lyrics, semitones, currentSong.currentKey)
  }, [currentSong])

  function selectSong(index: number) {
    if (index < 0 || index >= songs.length) return
    setCurrentIndex(index)
    setCurrentSong(songs[index])
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await document.documentElement.requestFullscreen()
      }
      setIsFullscreen(Boolean(document.fullscreenElement))
    } catch {
      setError('Tela cheia não está disponível neste dispositivo.')
    }
  }

  if (error) {
    return (
      <main className="stage-page stage-page--dark">
        <p role="alert">{error}</p>
        <button type="button" onClick={() => navigate(-1)}>Voltar</button>
      </main>
    )
  }

  if (!currentSong) {
    return (
      <main className="stage-page stage-page--dark">
        <p>Carregando Modo Palco...</p>
      </main>
    )
  }

  const hasPrevious = currentIndex > 0
  const hasNext = currentIndex < songs.length - 1

  return (
    <main className="stage-page stage-page--dark" style={{ '--stage-font-size': `${fontSize}px` } as React.CSSProperties}>
      <header className="stage-toolbar">
        <button type="button" onClick={() => navigate(isSetlistMode ? `/repertoires/${setlistId}` : `/songs/${currentSong.id}`)}>
          Sair
        </button>
        <div className="stage-toolbar__title">
          <strong>{currentSong.title}</strong>
          {songs.length > 1 && <span>{currentIndex + 1}/{songs.length}</span>}
        </div>
        <button type="button" onClick={() => void toggleFullscreen()}>
          {isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        </button>
      </header>

      <section className="stage-meta" aria-label="Informações da música">
        {currentSong.artist && <span>{currentSong.artist}</span>}
        <span>Tom: {currentSong.currentKey}</span>
        {currentSong.bpm !== undefined && <span>BPM: {currentSong.bpm}</span>}
      </section>

      <section className="stage-content" aria-labelledby="stage-song-title">
        <h1 id="stage-song-title">{currentSong.title}</h1>
        <pre style={{ fontSize: 'var(--stage-font-size)' }}>{displayedLyrics}</pre>
        {currentSong.notes && (
          <aside className="stage-notes">
            <strong>Observações</strong>
            <p>{currentSong.notes}</p>
          </aside>
        )}
      </section>

      <footer className="stage-controls">
        <button type="button" disabled={!hasPrevious} onClick={() => selectSong(currentIndex - 1)}>
          ← Anterior
        </button>
        <label>
          Fonte
          <input
            type="range"
            min="16"
            max="36"
            step="1"
            value={fontSize}
            onChange={(event) => setFontSize(Number(event.target.value))}
            aria-label="Tamanho da fonte"
          />
        </label>
        <button type="button" disabled={!hasNext} onClick={() => selectSong(currentIndex + 1)}>
          Próxima →
        </button>
      </footer>
    </main>
  )
}
