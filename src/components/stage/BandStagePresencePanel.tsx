import type { BandStageParticipant } from '../../domain/stage/bandStagePresence'
import { MUSICAL_ROLE_LABELS } from '../../domain/bands/musicalRole'
import './BandStagePresencePanel.css'

export function BandStagePresencePanel({ participants }: { participants: BandStageParticipant[] }) {
  return (
    <section className="band-stage-presence-panel" aria-label="Equipe conectada">
      <div className="band-stage-presence-panel__header">
        <strong>Equipe conectada</strong>
        <span>{participants.length} {participants.length === 1 ? 'participante' : 'participantes'}</span>
      </div>
      <div className="band-stage-presence-panel__list">
        {participants.length === 0
          ? <span className="band-stage-presence-panel__empty">Nenhum participante conectado.</span>
          : participants.map((participant) => (
            <div key={participant.userId} className="band-stage-presence-panel__item">
              <span className="band-stage-presence-panel__dot" aria-hidden="true" />
              <span className="band-stage-presence-panel__name">{participant.displayName}</span>
              <span className="band-stage-presence-panel__role">{participant.isMd ? 'MD' : MUSICAL_ROLE_LABELS[participant.musicalRole]}</span>
            </div>
          ))}
      </div>
    </section>
  )
}
