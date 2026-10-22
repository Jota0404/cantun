import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../auth/authContext'
import { StageExecutionService } from '../../application/stage/stageExecutionService'
import { TargetSharedExecutionService } from '../../application/stage/targetSharedExecutionService'
import { getServiceStageSongs, type ServiceStageSong } from '../../application/stage/getServiceStageSongs'
import { getStageMusicalRoleExperience, type StageMusicalRole } from '../../application/stage/stageExperience'
import type { StageSnapshot } from '../../domain/stage/stage'
import type { StageParticipant, StageReadiness } from '../../domain/stage/stagePresence'
import type { SharedExecutionState } from '../../domain/stage/sharedExecution'
import type { StageConnectionStatus } from './stageConnectionLabel'

export type ReadMode = 'scroll' | 'pages'

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

export function useServiceStageSession(sessionId: string) {
  const { user } = useAuth()
  const service = useMemo(() => new StageExecutionService(), [])
  const execution = useMemo(() => new TargetSharedExecutionService(service), [service])
  const [snapshot, setSnapshot] = useState<StageSnapshot>()
  const [executionState, setExecutionState] = useState<SharedExecutionState>()
  const [songs, setSongs] = useState<ServiceStageSong[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [sessionError, setError] = useState('')
  const [status, setStatus] = useState<StageConnectionStatus>('CONNECTING')
  const [fontSize, setFontSize] = useState(22)
  const [readMode, setReadMode] = useState<ReadMode>('scroll')
  const [musicalRole, setMusicalRole] = useState<StageMusicalRole>('other')
  const [annotationDraft, setAnnotationDraft] = useState('')
  const [participants, setParticipants] = useState<StageParticipant[]>([])
  const [readiness, setReadiness] = useState<StageReadiness>('waiting')

  const missingSession = !sessionId
  const error = missingSession ? 'Sessão de palco não informada.' : sessionError
  const md = Boolean(user?.id && snapshot?.session.mdUserId === user.id)

  const applySnapshot = useCallback((next: StageSnapshot) => {
    setSnapshot(next)
    const nextExecution = execution.applySnapshot(next)
    setExecutionState(nextExecution)
    setAnnotationDraft(nextExecution.mdAnnotation ?? '')
  }, [execution])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const initial = await service.connectOrLocal(sessionId, {
          onSnapshot: (next) => { if (!cancelled) applySnapshot(next) },
          onStatus: setStatus,
          onPresence: (list) => {
            setParticipants(list)
            const own = list.find((participant) => participant.userId === user?.id)
            if (own) setReadiness(own.readiness)
          },
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
          setError(message(err, 'Não foi possível abrir a sessão de palco.'))
          setLoading(false)
        }
      }
    }
    if (sessionId) void load()
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

  async function updateReadiness(next: StageReadiness) {
    if (!user?.id || md || next === readiness) return
    try {
      setReadiness(next)
      await service.trackPresence(sessionId, { musicalRole, readiness: next })
      setError('')
    } catch (err) {
      setReadiness('waiting')
      setError(message(err, 'Não foi possível atualizar seu status de preparação.'))
    }
  }

  async function refresh() {
    try {
      setBusy(true)
      setError('')
      applySnapshot(await service.refresh(sessionId))
    } catch (err) {
      setError(message(err, 'Não foi possível atualizar a sessão.'))
    } finally {
      setBusy(false)
    }
  }

  async function command(action: () => Promise<{ state: StageSnapshot['state'] }>) {
    try {
      setBusy(true)
      setError('')
      const result = await action()
      applySnapshot(await service.getSnapshot(sessionId))
      execution.applySnapshot({ session: snapshot!.session, state: result.state })
    } catch (err) {
      setError(message(err, 'Não foi possível aplicar o comando.'))
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function endSession() {
    if (!window.confirm('Encerrar a sessão de palco? Novos comandos ficarão bloqueados.')) return
    await command(async () => {
      await execution.end(sessionId)
      const next = await service.getSnapshot(sessionId)
      return { state: next.state }
    })
  }

  async function saveAnnotation(text = annotationDraft) {
    try {
      setBusy(true)
      setError('')
      const result = await service.setAnnotation(sessionId, text)
      const next = await service.getSnapshot(sessionId)
      applySnapshot({ session: snapshot!.session, state: next.state })
      execution.applySnapshot({ session: snapshot!.session, state: result.state })
    } catch (err) {
      setError(message(err, 'Não foi possível salvar a anotação.'))
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return {
    execution, snapshot, executionState, songs, loading: loading && !missingSession, busy, error, status,
    fontSize, setFontSize, readMode, setReadMode, musicalRole, annotationDraft, setAnnotationDraft,
    participants, readiness, md, updateReadiness, refresh, command, endSession, saveAnnotation,
  }
}
