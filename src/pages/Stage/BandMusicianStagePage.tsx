import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BandStageService } from '../../application/stage/bandStageService'
import { getBandStageSessionSetlist, type BandStageSetlistItem } from '../../application/stage/getBandStageSessionSetlist'
import { getMyBandStageExperience, getMusicalRoleStageExperience } from '../../application/stage/musicalRoleStageService'
import type { MusicalRole } from '../../domain/bands/musicalRole'
import type { BandStageSnapshot } from '../../domain/stage/bandStage'
import { getSemitoneDistance, transposeSongLyrics } from '../../domain/music/transpose'
import './BandMusicianStagePage.css'

type ReadMode = 'scroll' | 'pages'

export function BandMusicianStagePage() {
  const { sessionId = '' } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const service = useMemo(() => new BandStageService(), [])
  const [snapshot, setSnapshot] = useState<BandStageSnapshot>()
  const [songs, setSongs] = useState<BandStageSetlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('Conectando…')
  const [fontSize, setFontSize] = useState(22)
  const [readMode, setReadMode] = useState<ReadMode>('scroll')
  const [musicalRole, setMusicalRole] = useState<MusicalRole>('other')

  const applySnapshot = useCallback((next: BandStageSnapshot) => setSnapshot(next), [])

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
    return () => { cancelled = true; void service.disconnect(sessionId) }
  }, [applySnapshot, service, sessionId])

  async function refresh() {
    try {
      setError('')
      applySnapshot(await service.refresh(sessionId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar a sessão.')
    }
  }

  const activeIndex = snapshot?.state.currentIndex ?? 0
  const activeSong = songs[activeIndex]
  const experience = getMusicalRoleStageExperience(musicalRole)

  const displayedLyrics = useMemo(() => {
    if (!activeSong) return ''
    const key = snapshot?.state.currentKey ?? activeSong.currentKey
    const semitones = getSemitoneDistance(activeSong.originalKey, key)
    return transposeSongLyrics(activeSong.lyrics, semitones, key)
  }, [activeSong, snapshot?.state.currentKey])

  if (loading) return <main className="band-musician-stage"><div className="band-musician-stage__empty">Carregando palco…</div></main>

  if (error && !snapshot) return <main className="band-musician-stage"><div className="band-musician-stage__empty"><p role="alert">{error}</p><button type="button" onClick={() => navigate(-1)}>Voltar</button></div></main>

  if (!snapshot || !activeSong) return <main className="band-musician-stage"><div className="band-musician-stage__empty"><p>Nenhuma música disponível nesta sessão.</p><button type="button" onClick={() => navigate(-1)}>Voltar</button></div></main>

  return (
    <main className="band-musician-stage" data-musical-role={musicalRole} style={{ '--musician-font-size': `${fontSize}px` } as React.CSSProperties}>
      <header className="band-musician-stage__header">
        <div>
          <Link to="/bands">← Bandas</Link>
          <span className="band-musician-stage__kicker">MODO BANDA · {experience.accentLabel.toUpperCase()}</span>
          <h1>{activeSong.title}</h1>
          <p>{activeSong.artist ?? 'Sem artista'} · {activeIndex + 1}/{songs.length}{experience.showKey && <> · Tom: {snapshot.state.currentKey ?? activeSong.currentKey}</>}{experience.showBpm && activeSong.bpm && <> · BPM: {activeSong.bpm}</>}</p>
        </div>
        <div className="band-musician-stage__session">
          <span className={`band-musician-stage__status band-musician-stage__status--${snapshot.session.status}`}>{snapshot.session.status === 'live' ? 'Ao vivo' : snapshot.session.status === 'lobby' ? 'Lobby' : 'Encerrada'}</span>
          <span aria-live="polite">{status}</span>
          <button type="button" onClick={() => void refresh()}>Sincronizar</button>
          <button type="button" onClick={() => navigate('/')}>Sair</button>
        </div>
      </header>
      <section className="band-musician-stage__presence" aria-label="Estado da sessão"><span>Função: {experience.accentLabel}</span><span>Revisão {snapshot.state.revision}</span><span>MD operacional</span><span>Somente leitura</span>{snapshot.state.isRunning ? <span>Fluxo ativo</span> : <span>Fluxo pausado</span>}</section>
      {error && <p className="band-musician-stage__error" role="alert">{error}</p>}
      <div className="band-musician-stage__layout">
        <aside className="band-musician-stage__setlist" aria-label="Setlist da sessão"><div className="band-musician-stage__setlist-header"><strong>Setlist</strong><span>{songs.length}</span></div>{songs.map((song, index) => <div key={song.songId} className={index === activeIndex ? 'is-active' : ''} aria-current={index === activeIndex ? 'true' : undefined}><span>{index + 1}</span><strong>{song.title}</strong></div>)}</aside>
        <section className="band-musician-stage__content" aria-label={`Letra de ${activeSong.title}`}>
          <div className="band-musician-stage__toolbar"><div><button type="button" aria-pressed={readMode === 'scroll'} onClick={() => setReadMode('scroll')}>Rolagem</button><button type="button" aria-pressed={readMode === 'pages'} onClick={() => setReadMode('pages')}>Páginas</button></div><label>Tamanho <input aria-label="Tamanho da fonte" type="range" min="16" max="36" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label></div>
          <article className={`band-musician-stage__lyrics band-musician-stage__lyrics--${readMode}`}>{displayedLyrics.split('\n').map((line, index) => <div key={`${index}-${line}`}>{line || '\u00a0'}</div>)}{experience.showNotes && activeSong.notes && <aside><strong>Observações</strong><p>{activeSong.notes}</p></aside>}</article>
        </section>
      </div>
      <footer className="band-musician-stage__footer"><strong>{snapshot.state.isRunning ? 'O MD está conduzindo a música' : 'Aguardando comando do MD'}</strong><span>Os comandos de palco são controlados pelo MD. Este dispositivo apenas acompanha a sessão.</span></footer>
    </main>
  )
}
