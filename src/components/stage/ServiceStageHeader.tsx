import { Link } from 'react-router-dom'
import type { StageSnapshot } from '../../domain/stage/stage'
import { labels } from '../../ui/labels'

type Props = {
  kicker: string
  title: string
  artist?: string
  position: string
  keyLabel?: string
  bpm?: number
  sessionStatus: StageSnapshot['session']['status']
  connectionLabel: string
  md: boolean
  busy: boolean
  onRefresh: () => void
  onExit: () => void
}

const sessionStatusLabel = { live: 'Ao vivo', lobby: 'Lobby' } as const

export function ServiceStageHeader(p: Props) {
  const status = sessionStatusLabel[p.sessionStatus as 'live' | 'lobby'] ?? 'Encerrada'
  return (
    <header className="service-stage-header">
      <div>
        <Link to="/organizations">{labels.backToOrganizations}</Link>
        <span className="service-stage-kicker">{p.kicker}</span>
        <h1>{p.title}</h1>
        <p>
          {p.artist ?? 'Sem artista'} · {p.position}
          {p.keyLabel !== undefined && <> · Tom: {p.keyLabel}</>}
          {p.bpm && <> · BPM: {p.bpm}</>}
        </p>
      </div>
      <div className="service-stage-header__right">
        <span className={`service-stage-status service-stage-status--${p.sessionStatus}`}>{status}</span>
        <span aria-live="polite">{p.connectionLabel}</span>
        {p.md && <strong>MD</strong>}
        <button type="button" onClick={p.onRefresh} disabled={p.busy}>Sincronizar</button>
        <button type="button" onClick={p.onExit}>Sair</button>
      </div>
    </header>
  )
}
