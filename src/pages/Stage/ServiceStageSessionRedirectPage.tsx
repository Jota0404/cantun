import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { getStageSession } from '../../application/stage/stageSessionService'

export function ServiceStageSessionRedirectPage() {
  const { stageSessionId = '' } = useParams<{ stageSessionId: string }>()
  const [legacySessionId, setLegacySessionId] = useState<string>()
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!stageSessionId) return
    void getStageSession(stageSessionId)
      .then((session) => { if (!cancelled) setLegacySessionId(session.legacyBandStageSessionId) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Não foi possível abrir a sessão de palco.') })
    return () => { cancelled = true }
  }, [stageSessionId])

  if (error) return <main className="shell"><p role="alert">{error}</p></main>
  if (!legacySessionId) return <main className="shell"><p>Preparando palco…</p></main>
  return <Navigate to={`/stage/session/${legacySessionId}`} replace />
}