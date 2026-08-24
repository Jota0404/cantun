import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getStageSong } from '../../application/stage/getStageSong'
import { getStageSongs } from '../../application/stage/getStageSongs'
import { getSemitoneDistance, transposeSongLyrics } from '../../domain/music/transpose'
import type { SetlistSongRepository } from '../../db/repositories/setlistSongRepository'
import type { SongRepository } from '../../db/repositories/songRepository'
import type { Song } from '../../domain/songs/song'
import './StagePage.css'

type StagePageProps = {
  repository?: SongRepository
  setlistSongRepository?: SetlistSongRepository
}

const AUTO_SCROLL_SPEEDS = [
  { value: 20, label: 'Lenta' },
  { value: 40, label: 'Normal' },
  { value: 70, label: 'Rápida' },
] as const

function getAutoScrollSpeedLabel(speed: number) {
  return AUTO_SCROLL_SPEEDS.find((option) => option.value === speed)?.label ?? 'Normal'
}

export function StagePage({ repository, setlistSongRepository }: StagePageProps) {
  const { setlistId, songId } = useParams<{ setlistId?: string; songId?: string }>()
  const navigate = useNavigate()
  const isSetlistMode = Boolean(setlistId) && !songId
  const [songs, setSongs] = useState<Song[]>([])
  const [currentSong, setCurrentSong] = useState<Song | undefined>()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [fontSize, setFontSize] = useState(22)
  const [autoScrollSpeed, setAutoScrollSpeed] = useState(40)
  const [isAutoScrolling, setIsAutoScrolling] = useState(false)
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const autoScrollFrameRef = useRef<number | null>(null)
  const autoScrollLastTimestampRef = useRef<number | null>(null)
  const autoScrollSpeedRef = useRef(autoScrollSpeed)
  const isAutoScrollingRef = useRef(false)

  useEffect(() => {
    autoScrollSpeedRef.current = autoScrollSpeed
  }, [autoScrollSpeed])

  function stopAutoScroll() {
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current)
      autoScrollFrameRef.current = null
    }
    autoScrollLastTimestampRef.current = null
    isAutoScrollingRef.current = false
    setIsAutoScrolling(false)
  }

  function runAutoScroll(timestamp: number) {
    if (!isAutoScrollingRef.current) return

    const lastTimestamp = autoScrollLastTimestampRef.current ?? timestamp
    const elapsed = Math.min(timestamp - lastTimestamp, 100)
    autoScrollLastTimestampRef.current = timestamp

    const maxScrollTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
    if (window.scrollY >= maxScrollTop) {
      stopAutoScroll()
      return
    }

    window.scrollBy({ top: (autoScrollSpeedRef.current * elapsed) / 1000, behavior: 'auto' })
    autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll)
  }

  function startAutoScroll() {
    if (isAutoScrollingRef.current) return

    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current)
    }

    isAutoScrollingRef.current = true
    setIsAutoScrolling(true)
    autoScrollLastTimestampRef.current = null
    autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll)
  }

  function pauseAutoScroll() {
    stopAutoScroll()
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      setError(undefined)
      setLoading(true)
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
          setLoading(false)
        }
        return
      }

      if (songId) {
        const song = await getStageSong(songId, repository)
        if (!cancelled) {
          setSongs(song ? [song] : [])
          setCurrentSong(song)
          setCurrentIndex(0)
          setLoading(false)
        }
        return
      }

      if (!cancelled) {
        setError('Música não informada.')
        setLoading(false)
      }
    }

    void load().catch(() => {
      if (!cancelled) {
        setError('Não foi possível carregar o Modo Palco.')
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [isSetlistMode, repository, setlistId, setlistSongRepository, songId])

  useEffect(() => {
    if (!currentSong) return
    window.scrollTo({ top: 0 })
    if (isAutoScrollingRef.current) {
      if (autoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(autoScrollFrameRef.current)
      }
      autoScrollLastTimestampRef.current = null
      autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll)
    }
  }, [currentSong])

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => () => stopAutoScroll(), [])

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
    } catch {
      setError('Tela cheia não está disponível neste dispositivo.')
    }
  }

  if (loading) {
    return (
      <main className="stage-page stage-page--dark">
        <p>Carregando Modo Palco...</p>
      </main>
    )
  }

  if (error || !currentSong) {
    return (
      <main className="stage-page stage-page--dark">
        <p role="alert">{error ?? 'Nenhuma música disponível para o Modo Palco.'}</p>
        <button type="button" onClick={() => navigate(-1)}>Voltar</button>
      </main>
    )
  }

  const hasPrevious = currentIndex > 0
  const hasNext = currentIndex < songs.length - 1

  return (
    <main
      className="stage-page stage-page--dark"
      style={{ '--stage-font-size': `${fontSize}px` } as CSSProperties}
    >
      <header className="stage-toolbar">
        <button
          type="button"
          onClick={() => navigate(isSetlistMode ? `/repertoires/${setlistId}` : `/songs/${currentSong.id}`)}
        >
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
        <div className="stage-controls__auto-scroll" aria-label="Controles de auto-scroll">
          <div className="stage-controls__auto-scroll-row">
            <span aria-live="polite">Auto-scroll: {isAutoScrolling ? 'Ativo' : 'Pausado'}</span>
            {isAutoScrolling ? (
              <button type="button" onClick={pauseAutoScroll}>Pausar</button>
            ) : (
              <button type="button" onClick={startAutoScroll}>Iniciar</button>
            )}
          </div>
          <label>
            Velocidade: {getAutoScrollSpeedLabel(autoScrollSpeed)}
            <input
              type="range"
              min="20"
              max="70"
              step="10"
              value={autoScrollSpeed}
              onChange={(event) => setAutoScrollSpeed(Number(event.target.value))}
              aria-label="Velocidade do auto-scroll"
            />
          </label>
        </div>
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
