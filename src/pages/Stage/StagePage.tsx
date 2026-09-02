import { useEffect, useMemo, useRef, useState } from 'react'
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

type StageReadMode = 'scroll' | 'pages'

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
  const [readMode, setReadMode] = useState<StageReadMode>('scroll')
  const [pageIndex, setPageIndex] = useState(0)
  const [linesPerPage, setLinesPerPage] = useState(20)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const stageContentRef = useRef<HTMLElement | null>(null)

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
    setPageIndex(0)
    restartAtCurrentPosition()
  }, [currentSong, restartAtCurrentPosition])

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  useEffect(() => {
    if (readMode !== 'pages') return

    function updateLinesPerPage() {
      const measuredHeight = stageContentRef.current?.clientHeight ?? 0
      const fallbackHeight = window.innerHeight -
        (window.innerWidth <= 800 ? 250 : 190)
      const availableHeight = measuredHeight > 0 ? measuredHeight : fallbackHeight
      const lineHeight = fontSize * 1.5
      const nextLinesPerPage = Math.max(1, Math.floor(availableHeight / lineHeight))

      setLinesPerPage(nextLinesPerPage)
    }

    updateLinesPerPage()
    window.addEventListener('resize', updateLinesPerPage)

    return () => {
      window.removeEventListener('resize', updateLinesPerPage)
    }
  }, [fontSize, readMode])

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

  const pages = useMemo(() => {
    if (readMode !== 'pages') return []

    const lines = displayedLyrics.split('\n')
    const result: string[] = []

    for (let index = 0; index < lines.length; index += linesPerPage) {
      result.push(lines.slice(index, index + linesPerPage).join('\n'))
    }

    return result.length > 0 ? result : ['']
  }, [displayedLyrics, linesPerPage, readMode])

  useEffect(() => {
    setPageIndex((current) => Math.min(current, Math.max(0, pages.length - 1)))
  }, [pages.length])

  function selectSong(index: number) {
    if (index < 0 || index >= songs.length) return

    setCurrentIndex(index)
    setCurrentSong(songs[index])
  }

  function selectPage(index: number) {
    if (index < 0 || index >= pages.length) return

    setPageIndex(index)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest('button, input, label')) return

    touchStartRef.current = { x: event.clientX, y: event.clientY }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLElement>) {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start) return

    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    const horizontalSwipe =
      Math.abs(deltaX) >= 64 && Math.abs(deltaX) > Math.abs(deltaY)

    if (readMode === 'pages') {
      if (horizontalSwipe) {
        selectPage(deltaX < 0 ? pageIndex + 1 : pageIndex - 1)
        return
      }

      if (Math.abs(deltaX) < 18 && Math.abs(deltaY) < 18) {
        const width = window.innerWidth

        if (event.clientX >= width * 0.78) {
          selectPage(pageIndex + 1)
        } else if (event.clientX <= width * 0.22) {
          selectPage(pageIndex - 1)
        }
      }

      return
    }

    if (horizontalSwipe) {
      selectSong(deltaX < 0 ? currentIndex + 1 : currentIndex - 1)
      return
    }

    if (Math.abs(deltaX) < 18 && Math.abs(deltaY) < 18) {
      const width = window.innerWidth

      if (event.clientX >= width * 0.78) {
        selectSong(currentIndex + 1)
      } else if (event.clientX <= width * 0.22) {
        selectSong(currentIndex - 1)
      }
    }
  }

  function handlePointerCancel() {
    touchStartRef.current = null
  }

  function changeReadMode(mode: StageReadMode) {
    setReadMode(mode)
    setPageIndex(0)

    if (mode === 'pages') {
      pauseAutoScroll()
      window.scrollTo({ top: 0 })
    }
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
          {error ?? 'Nenhuma música disponível para o Modo Palco.'}
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
      className={`stage-page stage-page--dark${readMode === 'pages' ? ' stage-page--pages' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      style={{ '--stage-font-size': `${fontSize}px` } as CSSProperties}
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
          {songs.length > 1 && <span>{currentIndex + 1}/{songs.length}</span>}
          {readMode === 'pages' && (
            <span aria-live="polite">Página {pageIndex + 1}/{pages.length}</span>
          )}
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

      <section
        ref={stageContentRef}
        className={`stage-content${readMode === 'pages' ? ' stage-content--pages' : ''}`}
        aria-label={`Letra de ${currentSong.title}`}
      >
        {readMode === 'pages' ? (
          <StageLyrics lyrics={pages[pageIndex] ?? ''} />
        ) : (
          <StageLyrics lyrics={displayedLyrics} />
        )}

        {readMode === 'scroll' && currentSong.notes && (
          <aside className="stage-notes">
            <strong>Observações</strong>
            <p>{currentSong.notes}</p>
          </aside>
        )}

        {readMode === 'pages' && currentSong.notes && pageIndex === pages.length - 1 && (
          <aside className="stage-notes stage-notes--page">
            <strong>Observações</strong>
            <p>{currentSong.notes}</p>
          </aside>
        )}
      </section>

      <footer className={`stage-controls${readMode === 'pages' ? ' stage-controls--pages' : ''}`}>
        <div className="stage-controls__mode" aria-label="Modo de leitura">
          <button
            type="button"
            aria-pressed={readMode === 'scroll'}
            onClick={() => changeReadMode('scroll')}
          >
            Rolagem
          </button>
          <button
            type="button"
            aria-pressed={readMode === 'pages'}
            onClick={() => changeReadMode('pages')}
          >
            Páginas
          </button>
        </div>

        <button
          type="button"
          disabled={!hasPrevious}
          onClick={() => selectSong(currentIndex - 1)}
          aria-label="Música anterior"
        >
          ←
        </button>

        {readMode === 'scroll' ? (
          <div className="stage-controls__auto-scroll" aria-label="Controles de auto-scroll">
            <div className="stage-controls__auto-scroll-row">
              <span aria-live="polite">
                Auto-scroll: {isAutoScrolling ? 'Ativo' : 'Pausado'}
              </span>

              {isAutoScrolling ? (
                <button type="button" onClick={pauseAutoScroll}>Pausar</button>
              ) : (
                <button type="button" onClick={startAutoScroll}>
                  {hasAutoScrollStarted ? 'Retomar' : 'Iniciar'}
                </button>
              )}
            </div>

            <label>
              Velocidade: {getAutoScrollSpeedLabel(autoScrollSpeed)}
              <input
                type="range"
                min="0"
                max="2"
                step="1"
                value={autoScrollSpeedIndex}
                onChange={(event) => {
                  const index = Number(event.target.value)
                  setAutoScrollSpeed(AUTO_SCROLL_SPEEDS[index].value)
                }}
                aria-label="Velocidade do auto-scroll"
                aria-valuetext={getAutoScrollSpeedLabel(autoScrollSpeed)}
              />
            </label>
          </div>
        ) : (
          <div className="stage-controls__page-hint" aria-live="polite">
            Toque nas laterais ou deslize para mudar de página
          </div>
        )}

        <label className="stage-controls__font">
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
