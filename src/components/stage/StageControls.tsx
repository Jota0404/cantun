import {
  AUTO_SCROLL_SPEEDS,
  getAutoScrollSpeedLabel,
} from '../../pages/Stage/useAutoScroll'
import type { StageReadMode } from '../../pages/Stage/useStageReadMode'

type StageControlsProps = {
  readMode: StageReadMode
  onReadModeChange: (mode: StageReadMode) => void
  autoScrollSpeed: number
  onAutoScrollSpeedChange: (speed: number) => void
  isAutoScrolling: boolean
  hasAutoScrollStarted: boolean
  onStartAutoScroll: () => void
  onPauseAutoScroll: () => void
  fontSize: number
  onFontSizeChange: (size: number) => void
}

export function StageControls({
  readMode,
  onReadModeChange,
  autoScrollSpeed,
  onAutoScrollSpeedChange,
  isAutoScrolling,
  hasAutoScrollStarted,
  onStartAutoScroll,
  onPauseAutoScroll,
  fontSize,
  onFontSizeChange,
}: StageControlsProps) {
  const autoScrollSpeedIndex = AUTO_SCROLL_SPEEDS.findIndex(
    (option) => option.value === autoScrollSpeed,
  )

  return (
    <footer className={`stage-controls${readMode === 'pages' ? ' stage-controls--pages' : ''}`}>
      <div className="stage-controls__mode" aria-label="Modo de leitura">
        <button
          type="button"
          aria-pressed={readMode === 'scroll'}
          onClick={() => onReadModeChange('scroll')}
        >
          Rolagem
        </button>
        <button
          type="button"
          aria-pressed={readMode === 'pages'}
          onClick={() => onReadModeChange('pages')}
        >
          Páginas
        </button>
      </div>

      {readMode === 'scroll' ? (
        <div className="stage-controls__auto-scroll" aria-label="Controles de auto-scroll">
          <div className="stage-controls__auto-scroll-row">
            <span aria-live="polite">
              Auto-scroll: {isAutoScrolling ? 'Ativo' : 'Pausado'}
            </span>

            {isAutoScrolling ? (
              <button type="button" onClick={onPauseAutoScroll}>Pausar</button>
            ) : (
              <button type="button" onClick={onStartAutoScroll}>
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
                onAutoScrollSpeedChange(AUTO_SCROLL_SPEEDS[index].value)
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
          onChange={(event) => onFontSizeChange(Number(event.target.value))}
          aria-label="Tamanho da fonte"
        />
      </label>
    </footer>
  )
}
