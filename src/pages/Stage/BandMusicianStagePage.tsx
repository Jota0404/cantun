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
import './BandMusicianStagePage.css'

type ReadMode = 'scroll' | 'pages'

export function BandMusicianStagePage() {
  const { sessionId = '' } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const service = useMemo(() => new BandStageService(), [])
  const execution = useMemo(() => new SharedExecutionService(service), [service])
  const [snapshot, setSnapshot] = useState<BandStageSnapshot>()
  const [executionState, setExecutionState] = useState<SharedExecutionState>()
  const [songs, setSongs] = useState<BandStageSetlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('Conectando…')
  const [fontSize, setFontSize] = useState(22)
  const [readMode, setReadMode] = useState<ReadMode>('scroll')
  const [musicalRole, setMusicalRole] = useState<MusicalRole>('other')
  const [participants, setParticipants] = useState<BandStageParticipant[]>([])

  const applySnapshot = useCallback((next: BandStageSnapshot) => {
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

  const activeIndex = executionState?.currentIndex ?? 0
  const activeSong = songs[activeIndex]
  const experience = getMusicalRoleStageExperience(musicalRole)
  const displayedLyrics = useMemo(() => {
    if (!activeSong) return ''
    const key = executionState?.currentKey ?? activeSong.currentKey
    const semitones = getSemitoneDistance(activeSong.originalKey, key)
    return transposeSongLyrics(activeSong.lyrics, semitones, key)
  }, [activeSong, executionState?.currentKey])

  if (loading) return <main className="band-musician-stage"><div className="band-musician-stage__empty">Carregando palco…</div></main>
  if (error && !snapshot) return <main className="band-musician-stage"><div className="band-musician-stage__empty"><p role="alert">{error}</p><button type="button" onClick={() => navigate(-1)}>Voltar</button></div></main>
  if (!snapshot || !executionState || !activeSong) return <main className="band-musician-stage"><div className="band-musician-stage__empty"><p>Nenhuma música disponível nesta sessão.</p><button type="button" onClick={() => navigate(-1)}>Voltar</button></div></main>

  return (
    <main className="band-musician-stage" data-musical-role={musicalRole} style={{ '--musician-font-size': `${fontSize}px` } as React.CSSProperties}>
      <header className="band-musician-stage__header"><div><Link to="/bands">← Bandas</Link><span className="band-musician-stage__kicker">MODO BANDA · {experience.accentLabel.toUpperCase()}</span><h1>{activeSong.title}</h1><p>{activeSong.artist ?? 'Sem artista'} · {activeIndex + 1}/{songs.length}{experience.showKey && <> · Tom: {executionState.currentKey ?? activeSong.currentKey}</>}{experience.showBpm && activeSong.bpm && <> · BPM: {activeSong.bpm}</>}</p></div><div className="band-musician-stage__session"><span className={`band-musician-stage__status band-musician-stage__status--${snapshot.session.status}`}>{snapshot.session.status === 'live' ? 'Ao vivo' : snapshot.session.status === 'lobby' ? 'Lobby' : 'Encerrada'}</span><span aria-live="polite">{status}</span><button type="button" onClick={() => void refresh()}>Sincronizar</button><button type="button" onClick={() => navigate('/')}>Sair</button></div></header>
      <section className="band-musician-stage__presence" aria-label="Estado da execução"><span>Função: {experience.accentLabel}</span><span>Revisão {executionState.revision}</span><span>Execução: {executionState.status === 'running' ? 'ativa' : executionState.status === 'paused' ? 'pausada' : executionState.status === 'lobby' ? 'aguardando início' : 'encerrada'}</span><span>Somente leitura</span></section>
      <BandStagePresencePanel participants={participants} />
      {executionState.mdAnnotation && <aside className="band-musician-stage__annotation"><strong>Nota do MD</strong><p>{executionState.mdAnnotation}</p></aside>}
      {error && <p className="band-musician-stage__error" role="alert">{error}</p>}
      <div className="band-musician-stage__layout"><aside className="band-musician-stage__setlist" aria-label="Setlist da sessão"><div className="band-musician-stage__setlist-header"><strong>Setlist</strong><span>{songs.length}</span></div>{songs.map((song, index) => <div key={song.songId} className={index === activeIndex ? 'is-active' : ''} aria-current={index === activeIndex ? 'true' : undefined}><span>{index + 1}</span><strong>{song.title}</strong></div>)}</aside><section className="band-musician-stage__content" aria-label={`Letra de ${activeSong.title}`}><div className="band-musician-stage__toolbar"><div><button type="button" aria-pressed={readMode === 'scroll'} onClick={() => setReadMode('scroll')}>Rolagem</button><button type="button" aria-pressed={readMode === 'pages'} onClick={() => setReadMode('pages')}>Páginas</button></div><label>Tamanho <input aria-label="Tamanho da fonte" type="range" min="16" max="36" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label></div><article className={`band-musician-stage__lyrics band-musician-stage__lyrics--${readMode}`}>{displayedLyrics.split('\n').map((line, index) => <div key={`${index}-${line}`}>{line || '\u00a0'}</div>)}{experience.showNotes && activeSong.notes && <aside><strong>Observações</strong><p>{activeSong.notes}</p></aside>}</article></section></div>
      <footer className="band-musician-stage__footer"><strong>{executionState.status === 'running' ? 'O MD está conduzindo a música' : executionState.status === 'paused' ? 'Execução pausada pelo MD' : executionState.status === 'ended' ? 'Sessão encerrada' : 'Aguardando início do MD'}</strong><span>O estado de execução é compartilhado e somente o MD operacional pode alterá-lo.</span></footer>
    </main>
  )
}
