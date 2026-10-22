import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getStageMusicalRoleExperience } from '../../application/stage/stageExperience'
import type { MusicalKey } from '../../domain/music/musicalKey'
import { getSemitoneDistance, transposeSongLyrics } from '../../domain/music/transpose'
import { StagePresencePanel } from '../../components/stage/StagePresencePanel'
import { ServiceStageHeader } from '../../components/stage/ServiceStageHeader'
import { ServiceStageSessionInfo } from '../../components/stage/ServiceStageSessionInfo'
import { ServiceStageOrder } from '../../components/stage/ServiceStageOrder'
import { ServiceStageLyrics } from '../../components/stage/ServiceStageLyrics'
import { ServiceStageAnnotationEditor } from '../../components/stage/ServiceStageAnnotationEditor'
import { ServiceStageControls } from '../../components/stage/ServiceStageControls'
import { labels } from '../../ui/labels'
import { stageConnectionLabel } from './stageConnectionLabel'
import { useServiceStageSession } from './useServiceStageSession'
import './ServiceStagePage.css'

export function ServiceStagePage() {
  const { stageSessionId: sessionId = '' } = useParams<{ stageSessionId: string }>()
  const navigate = useNavigate()
  const s = useServiceStageSession(sessionId)
  const { snapshot, executionState, songs, execution, busy } = s
  const experience = getStageMusicalRoleExperience(s.musicalRole)
  // `currentIndex` é a `position` do item no serviço (itens não musicais ficam de fora de `songs`).
  const activeIndex = Math.max(0, songs.findIndex((song) => song.position === executionState?.currentIndex))
  const activeSong = songs[activeIndex]

  const displayedLyrics = useMemo(() => {
    if (!activeSong) return ''
    const key = (executionState?.currentKey ?? activeSong.currentKey) as MusicalKey
    return transposeSongLyrics(activeSong.lyrics, getSemitoneDistance(activeSong.originalKey, key), key)
  }, [activeSong, executionState?.currentKey])

  if (s.loading) return <main className="service-stage-page"><div className="service-stage-empty">Carregando sessão…</div></main>
  if (s.error && !snapshot) {
    return (
      <main className="service-stage-page">
        <div className="service-stage-empty"><p role="alert">{s.error}</p><button type="button" onClick={() => navigate(-1)}>Voltar</button></div>
      </main>
    )
  }
  if (!snapshot || !executionState || !activeSong) {
    return (
      <main className="service-stage-page">
        <div className="service-stage-empty">
          <p>Nenhuma música disponível nesta sessão.</p><button type="button" onClick={() => navigate(-1)}>Voltar</button>
        </div>
      </main>
    )
  }

  const live = snapshot.session.status === 'live'
  const musician = !s.md
  const keyLabel = executionState.currentKey ?? activeSong.currentKey
  const style = { '--service-stage-font-size': `${s.fontSize}px` } as React.CSSProperties

  return (
    <main
      className={musician ? 'service-stage-page service-stage-page--musician' : 'service-stage-page'}
      data-musical-role={musician ? s.musicalRole : undefined}
      style={style}
    >
      <ServiceStageHeader
        kicker={musician ? `MODO PALCO · ${experience.accentLabel.toUpperCase()}` : labels.stageMdKicker}
        title={activeSong.title}
        artist={activeSong.artist}
        position={`${activeIndex + 1}/${songs.length}`}
        keyLabel={!musician || experience.showKey ? keyLabel : undefined}
        bpm={musician && experience.showBpm ? activeSong.bpm : undefined}
        sessionStatus={snapshot.session.status}
        connectionLabel={stageConnectionLabel(s.status)}
        md={!musician}
        busy={busy}
        onRefresh={() => void s.refresh()}
        onExit={() => navigate('/')}
      />
      <ServiceStageSessionInfo execution={executionState} trailing={musician ? 'Somente visualização' : 'Você controla o palco'}>
        {musician && <span>Função: {experience.accentLabel}</span>}
      </ServiceStageSessionInfo>
      <StagePresencePanel participants={s.participants} />
      {musician && (
        <section className="service-stage-readiness" aria-label="Seu status de preparação">
          <strong>Seu status</strong>
          <span>{s.readiness === 'ready' ? 'Pronto' : 'Aguardando'}</span>
          <button type="button" aria-pressed={s.readiness === 'waiting'} onClick={() => void s.updateReadiness('waiting')}>Aguardando</button>
          <button type="button" aria-pressed={s.readiness === 'ready'} onClick={() => void s.updateReadiness('ready')}>Pronto</button>
        </section>
      )}
      {executionState.mdAnnotation && (
        <aside className={musician ? 'service-stage-annotation service-stage-annotation--musician' : 'service-stage-annotation'}>
          <strong>{musician ? 'Nota do MD' : 'Nota atual da sessão'}</strong><p>{executionState.mdAnnotation}</p>
        </aside>
      )}
      {s.error && <p className="service-stage-error" role="alert">{s.error}</p>}
      <div className="service-stage-layout">
        <ServiceStageOrder
          songs={songs}
          activeIndex={activeIndex}
          label={musician ? 'Ordem do serviço' : labels.stageOrder}
          disabled={busy || !live}
          onSelect={musician ? undefined : (song) => {
            if (live) void s.command(() => execution.goto(sessionId, song.position, song.songId))
          }}
        />
        <ServiceStageLyrics
          title={activeSong.title}
          lyrics={displayedLyrics}
          notes={!musician || experience.showNotes ? activeSong.notes : undefined}
          readMode={s.readMode}
          fontSize={s.fontSize}
          fontLabel={musician ? 'Tamanho da fonte' : undefined}
          onReadMode={s.setReadMode}
          onFontSize={s.setFontSize}
        />
      </div>
      {musician ? (
        <footer className="service-stage-controls service-stage-controls--musician">
          <strong>{musicianFooter[executionState.status] ?? 'Aguardando início do MD'}</strong>
          <span>O estado de execução é compartilhado e somente o MD operacional pode alterá-lo.</span>
        </footer>
      ) : (
        <>
          <ServiceStageAnnotationEditor
            draft={s.annotationDraft}
            published={executionState.mdAnnotation}
            disabled={!live || busy}
            onChange={s.setAnnotationDraft}
            onSave={() => void s.saveAnnotation()}
            // Comportamento atual preservado: o rascunho antigo é salvo (ver testes de caracterização).
            onClear={() => { s.setAnnotationDraft(''); void s.saveAnnotation() }}
          />
          <ServiceStageControls
            busy={busy}
            live={live}
            ended={executionState.status === 'ended'}
            running={executionState.isRunning}
            canPrevious={activeIndex > 0}
            canNext={activeIndex < songs.length - 1}
            onPrevious={() => void s.command(() => execution.previous(sessionId))}
            onToggle={() => void s.command(() => (executionState.isRunning ? execution.pause(sessionId) : execution.play(sessionId)))}
            onNext={() => void s.command(() => execution.next(sessionId))}
            onEnd={() => void s.endSession()}
          />
        </>
      )}
    </main>
  )
}

const musicianFooter: Record<string, string> = {
  running: 'O MD está conduzindo a música',
  paused: 'Execução pausada pelo MD',
  ended: 'Sessão encerrada',
}
