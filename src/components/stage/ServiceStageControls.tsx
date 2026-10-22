type Props = {
  busy: boolean
  live: boolean
  ended: boolean
  running: boolean
  canPrevious: boolean
  canNext: boolean
  onPrevious: () => void
  onToggle: () => void
  onNext: () => void
  onEnd: () => void
}

export function ServiceStageControls(p: Props) {
  return (
    <footer className="service-stage-controls">
      <button type="button" disabled={p.busy || !p.canPrevious || !p.live} onClick={p.onPrevious}>← Anterior</button>
      {p.live
        ? <button type="button" className="service-stage-controls__primary" disabled={p.busy} onClick={p.onToggle}>{p.running ? 'Pausar' : 'Play'}</button>
        : <span>{p.ended ? 'Sessão encerrada' : 'Sessão não está ao vivo'}</span>}
      <button type="button" disabled={p.busy || !p.canNext || !p.live} onClick={p.onNext}>Próxima →</button>
      {p.live && <button type="button" disabled={p.busy} onClick={p.onEnd}>Encerrar sessão</button>}
    </footer>
  )
}
