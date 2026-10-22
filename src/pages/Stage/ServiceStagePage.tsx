import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import { StageExecutionService } from '../../application/stage/stageExecutionService'
import { TargetSharedExecutionService } from '../../application/stage/targetSharedExecutionService'
import { getServiceStageSongs, type ServiceStageSong } from '../../application/stage/getServiceStageSongs'
import { getStageMusicalRoleExperience, type StageMusicalRole } from '../../application/stage/stageExperience'
import type { MusicalKey } from '../../domain/music/musicalKey'
import type { StageSnapshot } from '../../domain/stage/stage'
import type { StageParticipant, StageReadiness } from '../../domain/stage/stagePresence'
import { stageConnectionLabel, type StageConnectionStatus } from './stageConnectionLabel'
import { StagePresencePanel } from '../../components/stage/StagePresencePanel'
import type { SharedExecutionState } from '../../domain/stage/sharedExecution'
import { getSemitoneDistance, transposeSongLyrics } from '../../domain/music/transpose'
import { labels } from '../../ui/labels'
import './ServiceStagePage.css'

type ReadMode = 'scroll' | 'pages'

export function ServiceStagePage() {
  const { stageSessionId: sessionId = '' } = useParams<{ stageSessionId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const service = useMemo(() => new StageExecutionService(), [])
  const execution = useMemo(() => new TargetSharedExecutionService(service), [service])
  const [snapshot, setSnapshot] = useState<StageSnapshot>()
  const [executionState, setExecutionState] = useState<SharedExecutionState>()
  const [songs, setSongs] = useState<ServiceStageSong[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<StageConnectionStatus>('CONNECTING')
  const [fontSize, setFontSize] = useState(22)
  const [readMode, setReadMode] = useState<ReadMode>('scroll')
  const [musicalRole, setMusicalRole] = useState<StageMusicalRole>('other')
  const [annotationDraft, setAnnotationDraft] = useState('')
  const [participants, setParticipants] = useState<StageParticipant[]>([])
  const [readiness, setReadiness] = useState<StageReadiness>('waiting')

  const md = Boolean(user?.id && snapshot?.session.mdUserId === user.id)
  const musicianView = !md
  const experience = getStageMusicalRoleExperience(musicalRole)
  // `currentIndex` é a `position` do item no serviço (itens não musicais ficam de fora de `songs`).
  const activeIndex = Math.max(0, songs.findIndex((song) => song.position === executionState?.currentIndex))
  const activeSong = songs[activeIndex]

  const applySnapshot = useCallback((next: StageSnapshot) => {
    setSnapshot(next)
    const nextExecution = execution.applySnapshot(next)
    setExecutionState(nextExecution)
    setAnnotationDraft(nextExecution.mdAnnotation ?? '')
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

  useEffect(() => execution.subscribe(sessionId, setExecutionState), [execution, sessionId])

  useEffect(() => {
    if (snapshot?.session.status === 'ended') void service.disconnect(sessionId)
  }, [service, sessionId, snapshot?.session.status])

  useEffect(() => {
    const ownParticipant = participants.find((participant) => participant.userId === user?.id)
    if (ownParticipant) setReadiness(ownParticipant.readiness)
  }, [participants, user?.id])

  async function updateReadiness(next: StageReadiness) {
    if (!user?.id || md || next === readiness) return
    try {
      setReadiness(next)
      await service.trackPresence(sessionId, {
        musicalRole,
        readiness: next,
      })
      setError('')
    } catch (err) {
      setReadiness('waiting')
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar seu status de preparação.')
    }
  }

  async function refresh() {
    try {
      setBusy(true)
      setError('')
      applySnapshot(await service.refresh(sessionId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar a sessão.')
    } finally {
      setBusy(false)
    }
  }

  async function command(action: () => Promise<{ state: StageSnapshot['state']
 }>) {
    try {
      setBusy(true)
      setError('')
      const result = await action()
      applySnapshot(await service.getSnapshot(sessionId))
      execution.applySnapshot({ session: snapshot!.session, state: result.state })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível aplicar o comando.')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const displayedLyrics = useMemo(() => {
    if (!activeSong) return ''
    const key = (executionState?.currentKey ?? activeSong.currentKey) as MusicalKey
    const semitones = getSemitoneDistance(activeSong.originalKey, key)
    return transposeSongLyrics(activeSong.lyrics, semitones, key)
  }, [activeSong, executionState?.currentKey])

  async function endSession() {
    if (!window.confirm('Encerrar a sessão de palco? Novos comandos ficarão bloqueados.')) return
    await command(async () => {
      await execution.end(sessionId)
      const next = await service.getSnapshot(sessionId)
      return { state: next.state }
    })
  }

  async function saveAnnotation() {
    try {
      setBusy(true)
      setError('')
      const result = await service.setAnnotation(sessionId, annotationDraft)
      const next = await service.getSnapshot(sessionId)
      applySnapshot({ session: snapshot!.session, state: next.state })
      execution.applySnapshot({ session: snapshot!.session, state: result.state })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a anotação.')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <main className="service-stage-page"><div className="service-stage-empty">Carregando sessão…</div></main>
  if (error && !snapshot) return <main className="service-stage-page"><div className="service-stage-empty"><p role="alert">{error}</p><button type="button" onClick={() => navigate(-1)}>Voltar</button></div></main>
  if (!snapshot || !executionState || !activeSong) return <main className="service-stage-page"><div className="service-stage-empty"><p>Nenhuma música disponível nesta sessão.</p><button type="button" onClick={() => navigate(-1)}>Voltar</button></div></main>

  if (musicianView) {
    return (
      <main className="service-stage-page service-stage-page--musician" data-musical-role={musicalRole} style={{ '--service-stage-font-size': `${fontSize}px` } as React.CSSProperties}>
        <header className="service-stage-header"><div><Link to="/organizations">{labels.backToOrganizations}</Link><span className="service-stage-kicker">MODO PALCO · {experience.accentLabel.toUpperCase()}</span><h1>{activeSong.title}</h1><p>{activeSong.artist ?? 'Sem artista'} · {activeIndex + 1}/{songs.length}{experience.showKey && <> · Tom: {executionState.currentKey ?? activeSong.currentKey}</>}{experience.showBpm && activeSong.bpm && <> · BPM: {activeSong.bpm}</>}</p></div><div className="service-stage-header__right"><span className={`service-stage-status service-stage-status--${snapshot.session.status}`}>{snapshot.session.status === 'live' ? 'Ao vivo' : snapshot.session.status === 'lobby' ? 'Lobby' : 'Encerrada'}</span><span aria-live="polite">{stageConnectionLabel(status)}</span><button type="button" onClick={() => void refresh()} disabled={busy}>Sincronizar</button><button type="button" onClick={() => navigate('/')}>Sair</button></div></header>
        <section className="service-stage-presence" aria-label="Informações da sessão"><span>Função: {experience.accentLabel}</span><span>Revisão {executionState.revision}</span><span>Execução: {executionState.status === 'running' ? 'ativa' : executionState.status === 'paused' ? 'pausada' : executionState.status === 'lobby' ? 'aguardando início' : 'encerrada'}</span><span>Somente visualização</span></section>
        <StagePresencePanel participants={participants} />
        <section className="service-stage-readiness" aria-label="Seu status de preparação"><strong>Seu status</strong><span>{readiness === 'ready' ? 'Pronto' : 'Aguardando'}</span><button type="button" aria-pressed={readiness === 'waiting'} onClick={() => void updateReadiness('waiting')}>Aguardando</button><button type="button" aria-pressed={readiness === 'ready'} onClick={() => void updateReadiness('ready')}>Pronto</button></section>
        {executionState.mdAnnotation && <aside className="service-stage-annotation service-stage-annotation--musician"><strong>Nota do MD</strong><p>{executionState.mdAnnotation}</p></aside>}
        {error && <p className="service-stage-error" role="alert">{error}</p>}
        <div className="service-stage-layout"><aside className="service-stage-order" aria-label="Ordem do serviço"><div className="service-stage-order__header"><strong>Ordem</strong><span>{songs.length}</span></div>{songs.map((song, index) => <div key={song.songId} className={index === activeIndex ? 'is-active' : ''} aria-current={index === activeIndex ? 'true' : undefined}><span>{index + 1}</span><strong>{song.title}</strong></div>)}</aside><section className="service-stage-content" aria-label={`Letra de ${activeSong.title}`}><div className="service-stage-content__toolbar"><div><button type="button" aria-pressed={readMode === 'scroll'} onClick={() => setReadMode('scroll')}>Rolagem</button><button type="button" aria-pressed={readMode === 'pages'} onClick={() => setReadMode('pages')}>Páginas</button></div><label>Tamanho <input aria-label="Tamanho da fonte" type="range" min="16" max="36" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label></div><article className={`service-stage-lyrics service-stage-lyrics--${readMode}`}>{displayedLyrics.split('\n').map((line, index) => <div key={`${index}-${line}`}>{line || '\u00a0'}</div>)}{experience.showNotes && activeSong.notes && <aside><strong>Observações</strong><p>{activeSong.notes}</p></aside>}</article></section></div>
        <footer className="service-stage-controls service-stage-controls--musician"><strong>{executionState.status === 'running' ? 'O MD está conduzindo a música' : executionState.status === 'paused' ? 'Execução pausada pelo MD' : executionState.status === 'ended' ? 'Sessão encerrada' : 'Aguardando início do MD'}</strong><span>O estado de execução é compartilhado e somente o MD operacional pode alterá-lo.</span></footer>
      </main>
    )
  }

  return (
    <main className="service-stage-page" style={{ '--service-stage-font-size': `${fontSize}px` } as React.CSSProperties}>
      <header className="service-stage-header"><div><Link to="/organizations">{labels.backToOrganizations}</Link><span className="service-stage-kicker">{labels.stageMdKicker}</span><h1>{activeSong.title}</h1><p>{activeSong.artist ?? 'Sem artista'} · {activeIndex + 1}/{songs.length} · Tom: {executionState.currentKey ?? activeSong.currentKey}</p></div><div className="service-stage-header__right"><span className={`service-stage-status service-stage-status--${snapshot.session.status}`}>{snapshot.session.status === 'live' ? 'Ao vivo' : snapshot.session.status === 'lobby' ? 'Lobby' : 'Encerrada'}</span><span aria-live="polite">{stageConnectionLabel(status)}</span><strong>MD</strong><button type="button" onClick={() => void refresh()} disabled={busy}>Sincronizar</button><button type="button" onClick={() => navigate('/')}>Sair</button></div></header>
      <section className="service-stage-presence" aria-label="Informações da sessão"><span>Revisão {executionState.revision}</span><span>Execução: {executionState.status === 'running' ? 'ativa' : executionState.status === 'paused' ? 'pausada' : executionState.status === 'lobby' ? 'aguardando início' : 'encerrada'}</span><span>Você controla o palco</span></section>
      <StagePresencePanel participants={participants} />
      {executionState.mdAnnotation && <aside className="service-stage-annotation"><strong>Nota atual da sessão</strong><p>{executionState.mdAnnotation}</p></aside>}
      {error && <p className="service-stage-error" role="alert">{error}</p>}
      <div className="service-stage-layout"><aside className="service-stage-order" aria-label={labels.stageOrder}><div className="service-stage-order__header"><strong>{labels.stageOrder}</strong><span>{songs.length}</span></div>{songs.map((song, index) => <button key={song.songId} type="button" className={index === activeIndex ? 'is-active' : ''} onClick={() => snapshot.session.status === 'live' ? void command(() => execution.goto(sessionId, song.position, song.songId)) : undefined} disabled={busy || snapshot.session.status !== 'live'}><span>{index + 1}</span><strong>{song.title}</strong></button>)}</aside><section className="service-stage-content" aria-label={`Letra de ${activeSong.title}`}><div className="service-stage-content__toolbar"><div><button type="button" aria-pressed={readMode === 'scroll'} onClick={() => setReadMode('scroll')}>Rolagem</button><button type="button" aria-pressed={readMode === 'pages'} onClick={() => setReadMode('pages')}>Páginas</button></div><label>Tamanho <input type="range" min="16" max="36" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label></div><article className={`service-stage-lyrics service-stage-lyrics--${readMode}`}>{displayedLyrics.split('\n').map((line, index) => <div key={`${index}-${line}`}>{line || '\u00a0'}</div>)}{activeSong.notes && <aside><strong>Observações</strong><p>{activeSong.notes}</p></aside>}</article></section></div>
      <section className="service-stage-annotation-editor" aria-label="Anotação do MD"><div><strong>Anotação da sessão</strong><span>{annotationDraft.length}/500</span></div><textarea maxLength={500} value={annotationDraft} onChange={(event) => setAnnotationDraft(event.target.value)} placeholder="Ex.: ponte mais baixa, cortar bateria no refrão…" disabled={snapshot.session.status !== 'live' || busy} /><div><span>Compartilhada com todos os músicos conectados.</span><button type="button" onClick={() => void saveAnnotation()} disabled={snapshot.session.status !== 'live' || busy}>{executionState.mdAnnotation ? 'Atualizar nota' : 'Publicar nota'}</button>{executionState.mdAnnotation && <button type="button" onClick={() => { setAnnotationDraft(''); void saveAnnotation() }} disabled={snapshot.session.status !== 'live' || busy}>Limpar</button>}</div></section>
      <footer className="service-stage-controls"><button type="button" disabled={busy || activeIndex <= 0 || snapshot.session.status !== 'live'} onClick={() => void command(() => execution.previous(sessionId))}>← Anterior</button>{snapshot.session.status === 'live' ? <button type="button" className="service-stage-controls__primary" disabled={busy} onClick={() => void command(() => executionState.isRunning ? execution.pause(sessionId) : execution.play(sessionId))}>{executionState.isRunning ? 'Pausar' : 'Play'}</button> : <span>{executionState.status === 'ended' ? 'Sessão encerrada' : 'Sessão não está ao vivo'}</span>}<button type="button" disabled={busy || activeIndex >= songs.length - 1 || snapshot.session.status !== 'live'} onClick={() => void command(() => execution.next(sessionId))}>Próxima →</button>{snapshot.session.status === 'live' && <button type="button" disabled={busy} onClick={() => void endSession()}>Encerrar sessão</button>}</footer>
    </main>
  )
}
