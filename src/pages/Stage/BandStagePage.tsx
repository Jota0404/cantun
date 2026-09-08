import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import { BandStageService } from '../../application/stage/bandStageService'
import { SharedExecutionService } from '../../application/stage/sharedExecutionService'
import { getBandStageSessionSetlist, type BandStageSetlistItem } from '../../application/stage/getBandStageSessionSetlist'
import { getMyBandStageExperience, getMusicalRoleStageExperience } from '../../application/stage/musicalRoleStageService'
import type { MusicalRole } from '../../domain/bands/musicalRole'
import type { BandStageSnapshot } from '../../domain/stage/bandStage'
import type { BandStageParticipant } from '../../domain/stage/bandStagePresence'
import { BandStagePresencePanel } from '../../components/stage/BandStagePresencePanel'
import type { SharedExecutionState } from '../../domain/stage/sharedExecution'
import { getSemitoneDistance, transposeSongLyrics } from '../../domain/music/transpose'
import './BandStagePage.css'

type ReadMode = 'scroll' | 'pages'

export function BandStagePage() {
  const { sessionId = '' } = useParams<{ sessionId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const service = useMemo(() => new BandStageService(), [])
  const execution = useMemo(() => new SharedExecutionService(service), [service])
  const [snapshot, setSnapshot] = useState<BandStageSnapshot>()
  const [executionState, setExecutionState] = useState<SharedExecutionState>()
  const [songs, setSongs] = useState<BandStageSetlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('Conectando…')
  const [fontSize, setFontSize] = useState(22)
  const [readMode, setReadMode] = useState<ReadMode>('scroll')
  const [musicalRole, setMusicalRole] = useState<MusicalRole>('other')
  const [annotationDraft, setAnnotationDraft] = useState('')
  const [participants, setParticipants] = useState<BandStageParticipant[]>([])

  const md = Boolean(user?.id && snapshot?.session.mdUserId === user.id)
  const musicianView = !md
  const experience = getMusicalRoleStageExperience(musicalRole)
  const activeIndex = executionState?.currentIndex ?? 0
  const activeSong = songs[activeIndex]

  const applySnapshot = useCallback((next: BandStageSnapshot) => {
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
        const initial = await service.connect(sessionId, {
          onSnapshot: (next) => { if (!cancelled) applySnapshot(next) },
          onEvent: () => {
            void service.getSnapshot(sessionId).then((next) => {
              if (!cancelled) applySnapshot(next)
            }).catch(() => undefined)
          },
          onStatus: setStatus,
          onPresence: setParticipants,
        })
        if (cancelled) return
        applySnapshot(initial)
        const loadedSongs = await getBandStageSessionSetlist(initial.session)
        if (cancelled) return
        setSongs(loadedSongs)
        if (user?.id) {
          await service.trackPresence(sessionId, {
            userId: user.id,
            displayName: user.user_metadata?.display_name ?? user.user_metadata?.name ?? user.email?.split('@')[0] ?? 'Participante',
            musicalRole: loadedSongs[0]?.musicalRole ?? 'other',
            isMd: initial.session.mdUserId === user.id,
          })
        }
        const roleExperience = await getMyBandStageExperience(initial.session.bandId)
        if (!cancelled) {
          setMusicalRole(loadedSongs[0]?.musicalRole ?? 'other')
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

  async function command(action: () => Promise<{ state: BandStageSnapshot['state'] }>) {
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
    const key = executionState?.currentKey ?? activeSong.currentKey
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

  if (loading) return <main className="band-stage-page"><div className="band-stage-empty">Carregando sessão…</div></main>
  if (error && !snapshot) return <main className="band-stage-page"><div className="band-stage-empty"><p role="alert">{error}</p><button type="button" onClick={() => navigate(-1)}>Voltar</button></div></main>
  if (!snapshot || !executionState || !activeSong) return <main className="band-stage-page"><div className="band-stage-empty"><p>Nenhuma música disponível nesta sessão.</p><button type="button" onClick={() => navigate(-1)}>Voltar</button></div></main>

  if (musicianView) {
    return (
      <main className="band-stage-page band-stage-page--musician" data-musical-role={musicalRole} style={{ '--band-stage-font-size': `${fontSize}px` } as React.CSSProperties}>
        <header className="band-stage-header"><div><Link to="/bands">← Bandas</Link><span className="band-stage-kicker">MODO BANDA · {experience.accentLabel.toUpperCase()}</span><h1>{activeSong.title}</h1><p>{activeSong.artist ?? 'Sem artista'} · {activeIndex + 1}/{songs.length}{experience.showKey && <> · Tom: {executionState.currentKey ?? activeSong.currentKey}</>}{experience.showBpm && activeSong.bpm && <> · BPM: {activeSong.bpm}</>}</p></div><div className="band-stage-header__right"><span className={`band-stage-status band-stage-status--${snapshot.session.status}`}>{snapshot.session.status === 'live' ? 'Ao vivo' : snapshot.session.status === 'lobby' ? 'Lobby' : 'Encerrada'}</span><span aria-live="polite">{status}</span><button type="button" onClick={() => void refresh()} disabled={busy}>Sincronizar</button><button type="button" onClick={() => navigate('/')}>Sair</button></div></header>
        <section className="band-stage-presence" aria-label="Informações da sessão"><span>Função: {experience.accentLabel}</span><span>Revisão {executionState.revision}</span><span>Execução: {executionState.status === 'running' ? 'ativa' : executionState.status === 'paused' ? 'pausada' : executionState.status === 'lobby' ? 'aguardando início' : 'encerrada'}</span><span>Somente visualização</span></section>
        <BandStagePresencePanel participants={participants} />
        {executionState.mdAnnotation && <aside className="band-stage-annotation band-stage-annotation--musician"><strong>Nota do MD</strong><p>{executionState.mdAnnotation}</p></aside>}
        {error && <p className="band-stage-error" role="alert">{error}</p>}
        <div className="band-stage-layout"><aside className="band-stage-setlist" aria-label="Setlist da sessão"><div className="band-stage-setlist__header"><strong>Setlist</strong><span>{songs.length}</span></div>{songs.map((song, index) => <div key={song.songId} className={index === activeIndex ? 'is-active' : ''} aria-current={index === activeIndex ? 'true' : undefined}><span>{index + 1}</span><strong>{song.title}</strong></div>)}</aside><section className="band-stage-content" aria-label={`Letra de ${activeSong.title}`}><div className="band-stage-content__toolbar"><div><button type="button" aria-pressed={readMode === 'scroll'} onClick={() => setReadMode('scroll')}>Rolagem</button><button type="button" aria-pressed={readMode === 'pages'} onClick={() => setReadMode('pages')}>Páginas</button></div><label>Tamanho <input aria-label="Tamanho da fonte" type="range" min="16" max="36" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label></div><article className={`band-stage-lyrics band-stage-lyrics--${readMode}`}>{displayedLyrics.split('\n').map((line, index) => <div key={`${index}-${line}`}>{line || '\u00a0'}</div>)}{experience.showNotes && activeSong.notes && <aside><strong>Observações</strong><p>{activeSong.notes}</p></aside>}</article></section></div>
        <footer className="band-stage-controls band-stage-controls--musician"><strong>{executionState.status === 'running' ? 'O MD está conduzindo a música' : executionState.status === 'paused' ? 'Execução pausada pelo MD' : executionState.status === 'ended' ? 'Sessão encerrada' : 'Aguardando início do MD'}</strong><span>O estado de execução é compartilhado e somente o MD operacional pode alterá-lo.</span></footer>
      </main>
    )
  }

  return (
    <main className="band-stage-page" style={{ '--band-stage-font-size': `${fontSize}px` } as React.CSSProperties}>
      <header className="band-stage-header"><div><Link to="/bands">← Bandas</Link><span className="band-stage-kicker">MODO BANDA · CONTROLE DO MD</span><h1>{activeSong.title}</h1><p>{activeSong.artist ?? 'Sem artista'} · {activeIndex + 1}/{songs.length} · Tom: {executionState.currentKey ?? activeSong.currentKey}</p></div><div className="band-stage-header__right"><span className={`band-stage-status band-stage-status--${snapshot.session.status}`}>{snapshot.session.status === 'live' ? 'Ao vivo' : snapshot.session.status === 'lobby' ? 'Lobby' : 'Encerrada'}</span><span aria-live="polite">{status}</span><strong>MD</strong><button type="button" onClick={() => void refresh()} disabled={busy}>Sincronizar</button><button type="button" onClick={() => navigate('/')}>Sair</button></div></header>
      <section className="band-stage-presence" aria-label="Informações da sessão"><span>Revisão {executionState.revision}</span><span>Execução: {executionState.status === 'running' ? 'ativa' : executionState.status === 'paused' ? 'pausada' : executionState.status === 'lobby' ? 'aguardando início' : 'encerrada'}</span><span>Você controla o palco</span></section>
      <BandStagePresencePanel participants={participants} />
      {executionState.mdAnnotation && <aside className="band-stage-annotation"><strong>Nota atual da sessão</strong><p>{executionState.mdAnnotation}</p></aside>}
      {error && <p className="band-stage-error" role="alert">{error}</p>}
      <div className="band-stage-layout"><aside className="band-stage-setlist" aria-label="Setlist da sessão"><div className="band-stage-setlist__header"><strong>Setlist</strong><span>{songs.length}</span></div>{songs.map((song, index) => <button key={song.songId} type="button" className={index === activeIndex ? 'is-active' : ''} onClick={() => snapshot.session.status === 'live' ? void command(() => execution.goto(sessionId, index, song.songId)) : undefined} disabled={busy || snapshot.session.status !== 'live'}><span>{index + 1}</span><strong>{song.title}</strong></button>)}</aside><section className="band-stage-content" aria-label={`Letra de ${activeSong.title}`}><div className="band-stage-content__toolbar"><div><button type="button" aria-pressed={readMode === 'scroll'} onClick={() => setReadMode('scroll')}>Rolagem</button><button type="button" aria-pressed={readMode === 'pages'} onClick={() => setReadMode('pages')}>Páginas</button></div><label>Tamanho <input type="range" min="16" max="36" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label></div><article className={`band-stage-lyrics band-stage-lyrics--${readMode}`}>{displayedLyrics.split('\n').map((line, index) => <div key={`${index}-${line}`}>{line || '\u00a0'}</div>)}{activeSong.notes && <aside><strong>Observações</strong><p>{activeSong.notes}</p></aside>}</article></section></div>
      <section className="band-stage-annotation-editor" aria-label="Anotação do MD"><div><strong>Anotação da sessão</strong><span>{annotationDraft.length}/500</span></div><textarea maxLength={500} value={annotationDraft} onChange={(event) => setAnnotationDraft(event.target.value)} placeholder="Ex.: ponte mais baixa, cortar bateria no refrão…" disabled={snapshot.session.status !== 'live' || busy} /><div><span>Compartilhada com todos os músicos conectados.</span><button type="button" onClick={() => void saveAnnotation()} disabled={snapshot.session.status !== 'live' || busy}>{executionState.mdAnnotation ? 'Atualizar nota' : 'Publicar nota'}</button>{executionState.mdAnnotation && <button type="button" onClick={() => { setAnnotationDraft(''); void saveAnnotation() }} disabled={snapshot.session.status !== 'live' || busy}>Limpar</button>}</div></section>
      <footer className="band-stage-controls"><button type="button" disabled={busy || activeIndex <= 0 || snapshot.session.status !== 'live'} onClick={() => void command(() => execution.previous(sessionId))}>← Anterior</button>{snapshot.session.status === 'live' ? <button type="button" className="band-stage-controls__primary" disabled={busy} onClick={() => void command(() => executionState.isRunning ? execution.pause(sessionId) : execution.play(sessionId))}>{executionState.isRunning ? 'Pausar' : 'Play'}</button> : <span>{executionState.status === 'ended' ? 'Sessão encerrada' : 'Sessão não está ao vivo'}</span>}<button type="button" disabled={busy || activeIndex >= songs.length - 1 || snapshot.session.status !== 'live'} onClick={() => void command(() => execution.next(sessionId))}>Próxima →</button>{snapshot.session.status === 'live' && <button type="button" disabled={busy} onClick={() => void command(() => execution.setKey(sessionId, activeSong.currentKey))}>Aplicar tom</button>}{snapshot.session.status === 'live' && <button type="button" className="band-stage-controls__danger" disabled={busy} onClick={() => void endSession()}>Encerrar sessão</button>}</footer>
    </main>
  )
}
