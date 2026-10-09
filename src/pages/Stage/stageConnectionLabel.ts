import type { StageConnectionCallbacks } from '../../application/stage/stageExecutionService'

export type StageConnectionStatus = Parameters<NonNullable<StageConnectionCallbacks['onStatus']>>[0]

// Record exaustivo: um status novo no realtime quebra o build até ganhar texto.
const labels: Record<StageConnectionStatus, string> = {
  CONNECTING: 'Conectando…',
  SUBSCRIBED: 'Conectado',
  RECONNECTING: 'Reconectando…',
  ERROR: 'Erro de conexão',
  DISCONNECTED: 'Desconectado',
}

export function stageConnectionLabel(status: StageConnectionStatus): string {
  return labels[status]
}
