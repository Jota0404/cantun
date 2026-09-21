import { BandStagePage } from './BandStagePage'
import { useParams } from 'react-router-dom'

/**
 * Target Stage entry point.
 *
 * The URL keeps the canonical StageSession.id. StageExecutionService translates
 * that identity into the legacy runtime internally while migration is in flight.
 */
export function ServiceStageSessionRedirectPage() {
  const { stageSessionId = '' } = useParams<{ stageSessionId: string }>()
  return <BandStagePage targetStageSessionId={stageSessionId} />
}
