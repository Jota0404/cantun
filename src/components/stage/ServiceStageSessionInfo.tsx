import type { ReactNode } from 'react'
import type { SharedExecutionState } from '../../domain/stage/sharedExecution'

const executionLabel = { running: 'ativa', paused: 'pausada', lobby: 'aguardando início' } as const

type Props = { execution: SharedExecutionState; children?: ReactNode; trailing: string }

export function ServiceStageSessionInfo({ execution, children, trailing }: Props) {
  const status = executionLabel[execution.status as keyof typeof executionLabel] ?? 'encerrada'
  return (
    <section className="service-stage-presence" aria-label="Informações da sessão">
      {children}
      <span>Revisão {execution.revision}</span>
      <span>Execução: {status}</span>
      <span>{trailing}</span>
    </section>
  )
}
