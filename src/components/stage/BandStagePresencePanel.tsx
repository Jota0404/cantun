import type { BandStageParticipant } from '../../domain/stage/bandStagePresence'
import { MUSICAL_ROLE_LABELS } from '../../domain/bands/musicalRole'
import './BandStagePresencePanel.css'

export function BandStagePresencePanel({ participants }: { participants: BandStageParticipant[] }) {
  const readyCount = participants.filter((participant) => participant.readiness === 'ready').length

  return (
    <section className="band-stage-presence-panel" aria-label="Equipe conectada">
      <div className="band-stage-presence-panel__header">
        <strong>Equipe conectada</strong>
        <span>{readyCount}/{participants.length} prontos</span>
      </div>
      <div className="band-stage-presence-panel__list">
        {participants.length === 0
          ? <span className="band-stage-presence-panel__empty">Nenhum participante conectado.</span>
          : participants.map((participant) => (
            <div key={participant.userId} className="band-stage-presence-panel__item">
              <span className={`band-stage-presence-panel__dot band-stage-presence-panel__dot--${participant.readiness}`} aria-hidden="true" />
              <span className="band-stage-presence-panel__name">{participant.displayName}</span>
              <span className="band-stage-presence-panel__role">{participant.isMd ? 'MD' : MUSICAL_ROLE_LABELS[participant.musicalRole]}</span>
              <span className="band-stage-presence-panel__readiness">{participant.readiness === 'ready' ? 'Pronto' : 'Aguardando'}</span>
            </div>
          ))}
      </div>
    </section>
  )
}
