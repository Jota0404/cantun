import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import { StageExecutionService } from '../../application/stage/stageExecutionService'
import { TargetSharedExecutionService } from '../../application/stage/targetSharedExecutionService'
import { getServiceStageSongs, type ServiceStageSong } from '../../application/stage/getServiceStageSongs'
import { getStageMusicalRoleExperience, type StageMusicalRole } from '../../application/stage/stageExperience'
import type { MusicalKey } from '../../domain/music/musicalKey'
import type { StageSnapshot } from '../../domain/stage/stage'
import type { StageParticipant } from '../../domain/stage/stagePresence'
import { stageConnectionLabel, type StageConnectionStatus } from './stageConnectionLabel'
import { StagePresencePanel } from '../../components/stage/StagePresencePanel'
import type { SharedExecutionState } from '../../domain/stage/sharedExecution'
import { getSemitoneDistance, transposeSongLyrics } from '../../domain/music/transpose'
import { labels } from '../../ui/labels'
import { useScrollTopOnChange } from './useScrollTopOnChange'
import { useWakeLock } from './useWakeLock'
import './ServiceStageMusicianPage.css'

type ReadMode = 'scroll' | 'pages'

export function ServiceStageMusicianPage() {
  const { stageSessionId: sessionId = '' } = useParams<{ stageSessionId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const service = useMemo(() => new StageExecutionService(), [])
  const execution = useMemo(() => new TargetSharedExecutionService(service), [service])
  const [snapshot, setSnapshot] = useState<StageSnapshot>()
  const [executionState, setExecutionState] = useState<SharedExecutionState>()
  const [songs, setSongs] = useState<ServiceStageSong[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<StageConnectionStatus>('CONNECTING')
  const [fontSize, setFontSize] = useState(22)
  const [readMode, setReadMode] = useState<ReadMode>('scroll')
  const [musicalRole, setMusicalRole] = useState<StageMusicalRole>('other')
  const [participants, setParticipants] = useState<StageParticipant[]>([])

  const applySnapshot = useCallback((next: StageSnapshot) => {
    setSnapshot(next)
    setExecutionState(execution.applySnapshot(next))
  }, [execution])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!sessionId) {
        setError('Sessão de palco não informada.')
        setLoading(false)
        return
      }
      try {
        const initial = await service.connectOrLocal(sessionId, {
          onSnapshot: (next) => { if (!cancelled) applySnapshot(next) },
          onStatus: setStatus,
          onPresence: setParticipants,
        })
        if (cancelled) return
        applySnapshot(initial)
        const loadedSongs = await getServiceStageSongs(sessionId)
        if (cancelled) return
        setSongs(loadedSongs)
        if (user?.id) {
          // Presença é best-effort: offline o Palco abre mesmo assim.
          await service.trackPresence(sessionId, {
            musicalRole: loadedSongs[0]?.musicalRole ?? 'other',
            readiness: 'waiting',
          }).catch(() => undefined)
        }
        const nextMusicalRole = loadedSongs[0]?.musicalRole ?? 'other'
        const roleExperience = getStageMusicalRoleExperience(nextMusicalRole)
        if (!cancelled) {
          setMusicalRole(nextMusicalRole)
          setFontSize(roleExperience.fontSize)
          setReadMode(roleExperience.readMode)
        }
        setLoading(false)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Não foi possível abrir a sessão de palco.')
          setLoading(false)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
      execution.dispose(sessionId)
      void service.disconnect(sessionId)
    }
  }, [applySnapshot, execution, service, sessionId, user])

  const refresh = useCallback(async () => {
    try {
      setError('')
      applySnapshot(await service.refresh(sessionId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar a sessão.')
    }
  }, [applySnapshot, service, sessionId])

  useEffect(() => execution.subscribe(sessionId, setExecutionState), [execution, sessionId])

  useEffect(() => {
    if (snapshot?.session.status === 'ended') void service.disconnect(sessionId)
  }, [service, sessionId, snapshot?.session.status])

  // `currentIndex` é a `position` do item no serviço (itens não musicais ficam de fora de `songs`).
  const activeIndex = Math.max(0, songs.findIndex((song) => song.position === executionState?.currentIndex))
  const activeSong = songs[activeIndex]
  useScrollTopOnChange(activeSong?.position)
  useWakeLock()
  const experience = getStageMusicalRoleExperience(musicalRole)
  const displayedLyrics = useMemo(() => {
    if (!activeSong) return ''
    const key = (executionState?.currentKey ?? activeSong.currentKey) as MusicalKey
    const semitones = getSemitoneDistance(activeSong.originalKey, key)
    return transposeSongLyrics(activeSong.lyrics, semitones, key)
  }, [activeSong, executionState?.currentKey])

  const empty = (content: React.ReactNode) => (
    <main className="service-stage-musician"><div className="service-stage-musician__empty">{content}</div></main>
  )
  const back = <button type="button" onClick={() => navigate(-1)}>Voltar</button>
  if (loading) return empty('Carregando palco…')
  if (error && !snapshot) return empty(<><p role="alert">{error}</p>{back}</>)
  if (!snapshot || !executionState || !activeSong) return empty(<><p>Nenhuma música disponível nesta sessão.</p>{back}</>)

  const sessionStatus = { live: 'Ao vivo', lobby: 'Lobby' }[snapshot.session.status as 'live' | 'lobby'] ?? 'Encerrada'
  const execLabel = { running: 'ativa', paused: 'pausada', lobby: 'aguardando início' }[executionState.status as 'running'] ?? 'encerrada'
  const footerLabel = { running: 'O MD está conduzindo a música', paused: 'Execução pausada pelo MD', ended: 'Sessão encerrada' }[
    executionState.status as 'running'
  ] ?? 'Aguardando início do MD'

  return (
    <main
      className="service-stage-musician"
      data-musical-role={musicalRole}
      style={{ '--musician-font-size': `${fontSize}px` } as React.CSSProperties}
    >
      <header className="service-stage-musician__header">
        <div>
          <Link to="/organizations">{labels.backToOrganizations}</Link>
          <span className="service-stage-musician__kicker">MODO PALCO · {experience.accentLabel.toUpperCase()}</span>
          <h1>{activeSong.title}</h1>
          <p>
            {activeSong.artist ?? 'Sem artista'} · {activeIndex + 1}/{songs.length}
            {experience.showKey && <> · Tom: {executionState.currentKey ?? activeSong.currentKey}</>}
            {experience.showBpm && activeSong.bpm && <> · BPM: {activeSong.bpm}</>}
          </p>
        </div>
        <div className="service-stage-musician__session">
          <span className={`service-stage-musician__status service-stage-musician__status--${snapshot.session.status}`}>{sessionStatus}</span>
          <span aria-live="polite">{stageConnectionLabel(status)}</span>
          <button type="button" onClick={() => void refresh()}>Sincronizar</button>
          <button type="button" onClick={() => navigate('/')}>Sair</button>
        </div>
      </header>
      <section className="service-stage-musician__presence" aria-label="Estado da execução">
        <span>Função: {experience.accentLabel}</span>
        <span>Revisão {executionState.revision}</span>
        <span>Execução: {execLabel}</span>
        <span>Somente leitura</span>
      </section>
      <StagePresencePanel participants={participants} />
      {executionState.mdAnnotation && (
        <aside className="service-stage-musician__annotation"><strong>Nota do MD</strong><p>{executionState.mdAnnotation}</p></aside>
      )}
      {error && <p className="service-stage-musician__error" role="alert">{error}</p>}
      <div className="service-stage-musician__layout">
        <aside className="service-stage-musician__order" aria-label="Ordem do serviço">
          <div className="service-stage-musician__order-header"><strong>Ordem</strong><span>{songs.length}</span></div>
          {songs.map((song, index) => (
            <div key={song.songId} className={index === activeIndex ? 'is-active' : ''} aria-current={index === activeIndex ? 'true' : undefined}>
              <span>{index + 1}</span><strong>{song.title}</strong>
            </div>
          ))}
        </aside>
        <section className="service-stage-musician__content" aria-label={`Letra de ${activeSong.title}`}>
          <div className="service-stage-musician__toolbar">
            <div>
              <button type="button" aria-pressed={readMode === 'scroll'} onClick={() => setReadMode('scroll')}>Rolagem</button>
              <button type="button" aria-pressed={readMode === 'pages'} onClick={() => setReadMode('pages')}>Páginas</button>
            </div>
            <label>
              Tamanho{' '}
              <input
                aria-label="Tamanho da fonte"
                type="range"
                min="16"
                max="36"
                value={fontSize}
                onChange={(event) => setFontSize(Number(event.target.value))}
              />
            </label>
          </div>
          <article className={`service-stage-musician__lyrics service-stage-musician__lyrics--${readMode}`}>
            {displayedLyrics.split('\n').map((line, index) => <div key={`${index}-${line}`}>{line || '\u00a0'}</div>)}
            {experience.showNotes && activeSong.notes && <aside><strong>Observações</strong><p>{activeSong.notes}</p></aside>}
          </article>
        </section>
      </div>
      <footer className="service-stage-musician__footer">
        <strong>{footerLabel}</strong>
        <span>O estado de execução é compartilhado e somente o MD operacional pode alterá-lo.</span>
      </footer>
    </main>
  )
}
