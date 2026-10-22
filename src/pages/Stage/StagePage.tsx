import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { SongRepository } from '../../db/repositories/songRepository'
import { StageControls } from '../../components/stage/StageControls'
import { StageLyrics } from '../../components/stage/StageLyrics'
import { StagePagedLyrics } from '../../components/stage/StagePagedLyrics'
import { useAutoScroll } from './useAutoScroll'
import { useFullscreen } from './useFullscreen'
import { useStageReadMode } from './useStageReadMode'
import { useStageSong } from './useStageSong'
import { useWakeLock } from './useWakeLock'
import './StagePage.css'

type StagePageProps = {
  repository?: SongRepository
}

export function StagePage({ repository }: StagePageProps) {
  const { songId } = useParams<{ songId?: string }>()
  const navigate = useNavigate()
  const [fontSize, setFontSize] = useState(22)

  useWakeLock()

  const autoScroll = useAutoScroll()
  const { restartAtCurrentPosition } = autoScroll
  const { isFullscreen, toggleFullscreen } = useFullscreen()
  const pages = useStageReadMode(autoScroll.pause)
  const { readMode, activePageIndex, pageCount } = pages
  const { song: currentSong, error, loading, displayedLyrics } = useStageSong(
    songId,
    repository,
    pages.resetPages,
  )

  useEffect(() => {
    if (!currentSong) return

    window.scrollTo({ top: 0 })
    restartAtCurrentPosition()
  }, [currentSong, restartAtCurrentPosition])

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

  return (
    <main
      className={`stage-page stage-page--dark${readMode === 'pages' ? ' stage-page--pages' : ''}`}
      onPointerDown={pages.handlePointerDown}
      onPointerUp={pages.handlePointerUp}
      onPointerCancel={pages.handlePointerCancel}
      style={{ '--stage-font-size': `${fontSize}px` } as CSSProperties}
    >
      <header className="stage-toolbar">
        <button
          type="button"
          onClick={() => navigate(`/songs/${currentSong.id}`)}
        >
          Sair
        </button>

        <div className="stage-toolbar__title">
          <strong>{currentSong.title}</strong>
          {readMode === 'pages' && (
            <span aria-live="polite">Página {activePageIndex + 1}/{pageCount}</span>
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

      {readMode === 'pages' ? (
        <StagePagedLyrics
          key={`${currentSong.id}-${displayedLyrics}`}
          lyrics={displayedLyrics}
          fontSize={fontSize}
          pageIndex={activePageIndex}
          onPageCountChange={pages.handlePageCountChange}
        />
      ) : (
        <section className="stage-content" aria-label={`Letra de ${currentSong.title}`}>
          <StageLyrics lyrics={displayedLyrics} />

          {currentSong.notes && (
            <aside className="stage-notes">
              <strong>Observações</strong>
              <p>{currentSong.notes}</p>
            </aside>
          )}
        </section>
      )}

      {readMode === 'pages' && currentSong.notes && activePageIndex === pageCount - 1 && (
        <aside className="stage-notes stage-notes--page">
          <strong>Observações</strong>
          <p>{currentSong.notes}</p>
        </aside>
      )}

      <StageControls
        readMode={readMode}
        onReadModeChange={pages.changeReadMode}
        autoScrollSpeed={autoScroll.speed}
        onAutoScrollSpeedChange={autoScroll.setSpeed}
        isAutoScrolling={autoScroll.isScrolling}
        hasAutoScrollStarted={autoScroll.hasStarted}
        onStartAutoScroll={autoScroll.start}
        onPauseAutoScroll={autoScroll.pause}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
      />
    </main>
  )
}
