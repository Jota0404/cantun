import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getStageSong } from '../../application/stage/getStageSong'
import { getStageSongs } from '../../application/stage/getStageSongs'
import {
  getSemitoneDistance,
  transposeSongLyrics,
} from '../../domain/music/transpose'
import type { SetlistSongRepository } from '../../db/repositories/setlistSongRepository'
import type { SongRepository } from '../../db/repositories/songRepository'
import type { Song } from '../../domain/songs/song'
import {
  AUTO_SCROLL_SPEEDS,
  getAutoScrollSpeedLabel,
  useAutoScroll,
} from './useAutoScroll'
import { useWakeLock } from './useWakeLock'
import './StagePage.css'

type StagePageProps = {
  repository?: SongRepository
  setlistSongRepository?: SetlistSongRepository
}

type ParsedStageLine = {
  type: 'text' | 'chord'
  value: string
}

function parseStageLine(line: string): ParsedStageLine[] {
  if (!line) return [{ type: 'text', value: '' }]

  const parts: ParsedStageLine[] = []
  let cursor = 0
  const chordPattern = /\[([^\]]+)\]/g
  let match = chordPattern.exec(line)

  while (match) {
    if (match.index > cursor) {
      parts.push({ type: 'text', value: line.slice(cursor, match.index) })
    }

    parts.push({ type: 'chord', value: match[1] })
    cursor = match.index + match[0].length
    match = chordPattern.exec(line)
  }

  if (cursor < line.length) {
    parts.push({ type: 'text', value: line.slice(cursor) })
  }

  return parts.length > 0 ? parts : [{ type: 'text', value: line }]
}

function StageLyrics({ lyrics }: { lyrics: string }) {
  return (
    <div className="stage-lyrics">
      {lyrics.split('\n').map((line, index) => (
        <div className="stage-lyrics__line" key={`${index}-${line}`}>
          {parseStageLine(line).map((part, partIndex) =>
            part.type === 'chord' ? (
              <span
                className="stage-chord"
                key={`${index}-${partIndex}-${part.value}`}
              >
                {part.value}
              </span>
            ) : (
              <span key={`${index}-${partIndex}-${part.value}`}>{part.value}</span>
            ),
          )}
        </div>
      ))}
    </div>
  )
}

export function StagePage({
  repository,
  setlistSongRepository,
}: StagePageProps) {
  const { setlistId, songId } = useParams<{
    setlistId?: string
    songId?: string
  }>()

  const navigate = useNavigate()
  const isSetlistMode = Boolean(setlistId) && !songId

  const [songs, setSongs] = useState<Song[]>([])
  const [currentSong, setCurrentSong] = useState<Song | undefined>()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [fontSize, setFontSize] = useState(22)
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const touchStartRef = useState<{ x: number; y: number } | null>(null)[0]
  const [, setTouchStart] = useState<{ x: number; y: number } | null>(null)

  useWakeLock()

  const {
    speed: autoScrollSpeed,
    setSpeed: setAutoScrollSpeed,
    isScrolling: isAutoScrolling,
    hasStarted: hasAutoScrollStarted,
    start: startAutoScroll,
    pause: pauseAutoScroll,
    restartAtCurrentPosition,
  } = useAutoScroll()

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
  }, [
    isSetlistMode,
    repository,
    setlistId,
    setlistSongRepository,
    songId,
  ])

  useEffect(() => {
    if (!currentSong) return

    window.scrollTo({ top: 0 })
    restartAtCurrentPosition()
  }, [currentSong, restartAtCurrentPosition])

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener(
      'fullscreenchange',
      handleFullscreenChange,
    )

    return () => {
      document.removeEventListener(
        'fullscreenchange',
        handleFullscreenChange,
      )
    }
  }, [])

  const displayedLyrics = useMemo(() => {
    if (!currentSong) return ''

    const semitones = getSemitoneDistance(
      currentSong.originalKey,
      currentSong.currentKey,
    )

    return transposeSongLyrics(
      currentSong.lyrics,
      semitones,
      currentSong.currentKey,
    )
  }, [currentSong])

  function selectSong(index: number) {
    if (index < 0 || index >= songs.length) return

    setCurrentIndex(index)
    setCurrentSong(songs[index])
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    setTouchStart({ x: event.clientX, y: event.clientY })
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLElement>) {
    const start = touchStartRef
    if (!start) return

    setTouchStart(null)

    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    const horizontalSwipe = Math.abs(deltaX) >= 64 && Math.abs(deltaX) > Math.abs(deltaY)

    if (horizontalSwipe) {
      selectSong(deltaX < 0 ? currentIndex + 1 : currentIndex - 1)
      return
    }

    const width = window.innerWidth
    if (Math.abs(deltaX) < 18 && Math.abs(deltaY) < 18) {
      if (event.clientX >= width * 0.78) {
        selectSong(currentIndex + 1)
      } else if (event.clientX <= width * 0.22) {
        selectSong(currentIndex - 1)
      }
    }
  }

  function handlePointerCancel() {
    setTouchStart(null)
  }

  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen()
      } catch {
        // Fullscreen is an optional browser/device capability.
      }

      return
    }

    try {
      await document.exitFullscreen()
    } catch {
      // Fullscreen is an optional browser/device capability.
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
        <p role="alert">
          {error ??
            'Nenhuma música disponível para o Modo Palco.'}
        </p>

        <button type="button" onClick={() => navigate(-1)}>
          Voltar
        </button>
      </main>
    )
  }

  const hasPrevious = currentIndex > 0
  const hasNext = currentIndex < songs.length - 1

  const autoScrollSpeedIndex = AUTO_SCROLL_SPEEDS.findIndex(
    (option) => option.value === autoScrollSpeed,
  )

  return (
    <main
      className="stage-page stage-page--dark"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      style={
        {
          '--stage-font-size': `${fontSize}px`,
        } as CSSProperties
      }
    >
      <header className="stage-toolbar">
        <button
          type="button"
          onClick={() =>
            navigate(
              isSetlistMode
                ? `/repertoires/${setlistId}`
                : `/songs/${currentSong.id}`,
            )
          }
        >
          Sair
        </button>

        <div className="stage-toolbar__title">
          <strong>{currentSong.title}</strong>

          {songs.length > 1 && (
            <span>
              {currentIndex + 1}/{songs.length}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => void toggleFullscreen()}
        >
          {isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        </button>
      </header>

      <section
        className="stage-meta"
        aria-label="Informações da música"
      >
        {currentSong.artist && (
          <span>{currentSong.artist}</span>
        )}

        <span>Tom: {currentSong.currentKey}</span>

        {currentSong.bpm !== undefined && (
          <span>BPM: {currentSong.bpm}</span>
        )}
      </section>

      <section
        className="stage-content"
        aria-label={`Letra de ${currentSong.title}`}
      >
        <StageLyrics lyrics={displayedLyrics} />

        {currentSong.notes && (
          <aside className="stage-notes">
            <strong>Observações</strong>
            <p>{currentSong.notes}</p>
          </aside>
        )}
      </section>

      <footer className="stage-controls">
        <button
          type="button"
          disabled={!hasPrevious}
          onClick={() => selectSong(currentIndex - 1)}
          aria-label="Música anterior"
        >
          ←
        </button>

        <div
          className="stage-controls__auto-scroll"
          aria-label="Controles de auto-scroll"
        >
          <div className="stage-controls__auto-scroll-row">
            <span aria-live="polite">
              Auto-scroll:{' '}
              {isAutoScrolling ? 'Ativo' : 'Pausado'}
            </span>

            {isAutoScrolling ? (
              <button
                type="button"
                onClick={pauseAutoScroll}
              >
                Pausar
              </button>
            ) : (
              <button
                type="button"
                onClick={startAutoScroll}
              >
                {hasAutoScrollStarted ? 'Retomar' : 'Iniciar'}
              </button>
            )}
          </div>

          <label>
            Velocidade:{' '}
            {getAutoScrollSpeedLabel(autoScrollSpeed)}

            <input
              type="range"
              min="0"
              max="2"
              step="1"
              value={autoScrollSpeedIndex}
              onChange={(event) => {
                const index = Number(event.target.value)

                setAutoScrollSpeed(
                  AUTO_SCROLL_SPEEDS[index].value,
                )
              }}
              aria-label="Velocidade do auto-scroll"
              aria-valuetext={getAutoScrollSpeedLabel(
                autoScrollSpeed,
              )}
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
            onChange={(event) =>
              setFontSize(Number(event.target.value))
            }
            aria-label="Tamanho da fonte"
          />
        </label>

        <button
          type="button"
          disabled={!hasNext}
          onClick={() => selectSong(currentIndex + 1)}
          aria-label="Próxima música"
        >
          →
        </button>
      </footer>
    </main>
  )
}
