import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import { BandStageService } from '../../application/stage/bandStageService'
import { getBandStageSessionSetlist, type BandStageSetlistItem } from '../../application/stage/getBandStageSessionSetlist'
import { getMyBandStageExperience, getMusicalRoleStageExperience } from '../../application/stage/musicalRoleStageService'
import type { MusicalRole } from '../../domain/bands/musicalRole'
import type { BandStageSnapshot } from '../../domain/stage/bandStage'
import { getSemitoneDistance, transposeSongLyrics } from '../../domain/music/transpose'
import './BandStagePage.css'

type ReadMode = 'scroll' | 'pages'

export function BandStagePage() {
  const { sessionId = '' } = useParams<{ sessionId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const service = useMemo(() => new BandStageService(), [])
  const [snapshot, setSnapshot] = useState<BandStageSnapshot>()
  const [songs, setSongs] = useState<BandStageSetlistItem[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('Conectando…')
  const [fontSize, setFontSize] = useState(22)
  const [readMode, setReadMode] = useState<ReadMode>('scroll')
  const [running, setRunning] = useState(false)
  const [musicalRole, setMusicalRole] = useState<MusicalRole>('other')
  const [annotationDraft, setAnnotationDraft] = useState('')

  const md = Boolean(user?.id && snapshot?.session.mdUserId === user.id)
  const musicianView = !md
  const experience = getMusicalRoleStageExperience(musicalRole)
  const activeIndex = snapshot?.state.currentIndex ?? selectedIndex
  const activeSong = songs[activeIndex] ?? songs[selectedIndex]

  const applySnapshot = useCallback((next: BandStageSnapshot) => {
    setSnapshot(next)
    setSelectedIndex(next.state.currentIndex)
    setRunning(next.state.isRunning)
    setAnnotationDraft(next.state.mdAnnotation ?? '')
  }, [])

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
          onSnapshot: (next) => {
            if (!cancelled) applySnapshot(next)
          },
          onStatus: setStatus,
        })
        if (cancelled) return
        applySnapshot(initial)

        const loadedSongs = await getBandStageSessionSetlist(initial.session)
        if (cancelled) return
        setSongs(loadedSongs)

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
      void service.disconnect(sessionId)
    }
  }, [applySnapshot, service, sessionId])

  async function refresh() {
    try {
      setBusy(true)
      setError('')
      const next = await service.refresh(sessionId)
      applySnapshot(next)
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
      setRunning(result.state.isRunning)
      setSelectedIndex(result.state.currentIndex)
      const next = await service.getSnapshot(sessionId)
      applySnapshot(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível aplicar o comando.')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const displayedLyrics = useMemo(() => {
    if (!activeSong) return ''
    const key = snapshot?.state.currentKey ?? activeSong.currentKey
    const semitones = getSemitoneDistance(activeSong.originalKey, key)
    return transposeSongLyrics(activeSong.lyrics, semitones, key)
  }, [activeSong, snapshot?.state.currentKey])

  async function endSession() {
    if (!window.confirm('Encerrar a sessão de palco? Novos comandos ficarão bloqueados.')) return
    await command(async () => {
      const session = await service.endSession(sessionId)
      const next = await service.getSnapshot(session.id)
      applySnapshot(next)
      return { state: next.state }
    })
  }

  async function saveAnnotation() {
    try {
      setBusy(true)
      setError('')
      const result = await service.setAnnotation(sessionId, annotationDraft)
      applySnapshot({ session: snapshot!.session, state: result.state })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a anotação.')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <main className="band-stage-page"><div className="band-stage-empty">Carregando sessão…</div></main>
  }

  if (error && !snapshot) {
    return <main className="band-stage-page"><div className="band-stage-empty"><p role="alert">{error}</p><button type="button" onClick={() => navigate(-1)}>Voltar</button></div></main>
  }

  if (!snapshot || !activeSong) {
    return <main className="band-stage-page"><div className="band-stage-empty"><p>Nenhuma música disponível nesta sessão.</p><button type="button" onClick={() => navigate(-1)}>Voltar</button></div></main>
  }

  if (musicianView) {
    return (
      <main className="band-stage-page band-stage-page--musician" data-musical-role={musicalRole} style={{ '--band-stage-font-size': `${fontSize}px` } as React.CSSProperties}>
        <header className="band-stage-header">
          <div>
            <Link to="/bands">← Bandas</Link>
            <span className="band-stage-kicker">MODO BANDA · {experience.accentLabel.toUpperCase()}</span>
            <h1>{activeSong.title}</h1>
            <p>{activeSong.artist ?? 'Sem artista'} · {activeIndex + 1}/{songs.length}{experience.showKey && <> · Tom: {snapshot.state.currentKey ?? activeSong.currentKey}</>}{experience.showBpm && activeSong.bpm && <> · BPM: {activeSong.bpm}</>}</p>
          </div>
          <div className="band-stage-header__right">
            <span className={`band-stage-status band-stage-status--${snapshot.session.status}`}>{snapshot.session.status === 'live' ? 'Ao vivo' : snapshot.session.status === 'lobby' ? 'Lobby' : 'Encerrada'}</span>
            <span aria-live="polite">{status}</span>
            <button type="button" onClick={() => void refresh()} disabled={busy}>Sincronizar</button>
            <button type="button" onClick={() => navigate('/')}>Sair</button>
          </div>
        </header>
        <section className="band-stage-presence" aria-label="Informações da sessão"><span>Função: {experience.accentLabel}</span><span>Revisão {snapshot.state.revision}</span><span>MD operacional</span><span>Somente visualização</span><span>{snapshot.state.isRunning ? 'Fluxo ativo' : 'Fluxo pausado'}</span></section>
        {snapshot.state.mdAnnotation && <aside className="band-stage-annotation band-stage-annotation--musician"><strong>Nota do MD</strong><p>{snapshot.state.mdAnnotation}</p></aside>}
        {error && <p className="band-stage-error" role="alert">{error}</p>}
        <div className="band-stage-layout">
          <aside className="band-stage-setlist" aria-label="Setlist da sessão"><div className="band-stage-setlist__header"><strong>Setlist</strong><span>{songs.length}</span></div>{songs.map((song, index) => <div key={song.songId} className={index === activeIndex ? 'is-active' : ''} aria-current={index === activeIndex ? 'true' : undefined}><span>{index + 1}</span><strong>{song.title}</strong></div>)}</aside>
          <section className="band-stage-content" aria-label={`Letra de ${activeSong.title}`}>
            <div className="band-stage-content__toolbar"><div><button type="button" aria-pressed={readMode === 'scroll'} onClick={() => setReadMode('scroll')}>Rolagem</button><button type="button" aria-pressed={readMode === 'pages'} onClick={() => setReadMode('pages')}>Páginas</button></div><label>Tamanho <input aria-label="Tamanho da fonte" type="range" min="16" max="36" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label></div>
            <article className={`band-stage-lyrics band-stage-lyrics--${readMode}`}>{displayedLyrics.split('\n').map((line, index) => <div key={`${index}-${line}`}>{line || '\u00a0'}</div>)}{experience.showNotes && activeSong.notes && <aside><strong>Observações</strong><p>{activeSong.notes}</p></aside>}</article>
          </section>
        </div>
        <footer className="band-stage-controls band-stage-controls--musician"><strong>{snapshot.state.isRunning ? 'O MD está conduzindo a música' : 'Aguardando comando do MD'}</strong><span>Seu dispositivo acompanha o estado compartilhado. Comandos de palco ficam com o MD.</span></footer>
      </main>
    )
  }

  return (
    <main className="band-stage-page" style={{ '--band-stage-font-size': `${fontSize}px` } as React.CSSProperties}>
      <header className="band-stage-header"><div><Link to="/bands">← Bandas</Link><span className="band-stage-kicker">MODO BANDA</span><h1>{activeSong.title}</h1><p>{activeSong.artist ?? 'Sem artista'} · {activeIndex + 1}/{songs.length} · Tom: {snapshot.state.currentKey ?? activeSong.currentKey}</p></div><div className="band-stage-header__right"><span className={`band-stage-status band-stage-status--${snapshot.session.status}`}>{snapshot.session.status === 'live' ? 'Ao vivo' : snapshot.session.status === 'lobby' ? 'Lobby' : 'Encerrada'}</span><span aria-live="polite">{status}</span><strong>MD</strong><button type="button" onClick={() => void refresh()} disabled={busy}>Sincronizar</button><button type="button" onClick={() => navigate('/')}>Sair</button></div></header>
      <section className="band-stage-presence" aria-label="Informações da sessão"><span>Revisão {snapshot.state.revision}</span><span>Você controla o palco</span></section>
      {snapshot.state.mdAnnotation && <aside className="band-stage-annotation"><strong>Nota atual da sessão</strong><p>{snapshot.state.mdAnnotation}</p></aside>}
      {error && <p className="band-stage-error" role="alert">{error}</p>}
      <div className="band-stage-layout"><aside className="band-stage-setlist" aria-label="Setlist da sessão"><div className="band-stage-setlist__header"><strong>Setlist</strong><span>{songs.length}</span></div>{songs.map((song, index) => <button key={song.songId} type="button" className={index === activeIndex ? 'is-active' : ''} onClick={() => snapshot.session.status === 'live' ? void command(() => service.goto(sessionId, index, song.songId)) : setSelectedIndex(index)} disabled={busy}><span>{index + 1}</span><strong>{song.title}</strong></button>)}</aside>
        <section className="band-stage-content" aria-label={`Letra de ${activeSong.title}`}><div className="band-stage-content__toolbar"><div><button type="button" aria-pressed={readMode === 'scroll'} onClick={() => setReadMode('scroll')}>Rolagem</button><button type="button" aria-pressed={readMode === 'pages'} onClick={() => setReadMode('pages')}>Páginas</button></div><label>Tamanho <input type="range" min="16" max="36" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label></div><article className={`band-stage-lyrics band-stage-lyrics--${readMode}`}>{displayedLyrics.split('\n').map((line, index) => <div key={`${index}-${line}`}>{line || '\u00a0'}</div>)}{activeSong.notes && <aside><strong>Observações</strong><p>{activeSong.notes}</p></aside>}</article></section></div>
      <section className="band-stage-annotation-editor" aria-label="Anotação do MD"><div><strong>Anotação da sessão</strong><span>{annotationDraft.length}/500</span></div><textarea maxLength={500} value={annotationDraft} onChange={(event) => setAnnotationDraft(event.target.value)} placeholder="Ex.: ponte mais baixa, cortar bateria no refrão, ministrar antes da próxima música…" disabled={snapshot.session.status !== 'live' || busy} /><div><span>A anotação é compartilhada com os músicos conectados.</span><button type="button" onClick={() => void saveAnnotation()} disabled={snapshot.session.status !== 'live' || busy}>{snapshot.state.mdAnnotation ? 'Atualizar nota' : 'Publicar nota'}</button>{snapshot.state.mdAnnotation && <button type="button" onClick={() => { setAnnotationDraft(''); void saveAnnotation() }} disabled={snapshot.session.status !== 'live' || busy}>Limpar</button>}</div></section>
      <footer className="band-stage-controls"><button type="button" disabled={busy || activeIndex <= 0 || snapshot.session.status !== 'live'} onClick={() => void command(() => service.previous(sessionId))}>← Anterior</button>{snapshot.session.status === 'live' ? <button type="button" className="band-stage-controls__primary" disabled={busy} onClick={() => void command(() => running ? service.pause(sessionId) : service.play(sessionId))}>{running ? 'Pausar' : 'Play'}</button> : <span>Sessão não está ao vivo</span>}<button type="button" disabled={busy || activeIndex >= songs.length - 1 || snapshot.session.status !== 'live'} onClick={() => void command(() => service.next(sessionId))}>Próxima →</button>{snapshot.session.status === 'live' && <button type="button" disabled={busy} onClick={() => void command(() => service.setKey(sessionId, activeSong.currentKey))}>Aplicar tom</button>}{snapshot.session.status === 'live' && <button type="button" className="band-stage-controls__danger" disabled={busy} onClick={() => void endSession()}>Encerrar sessão</button>}</footer>
    </main>
  )
}
