import type { ServiceStatus } from '../../domain/services/service'
import type { ServiceItemType } from '../../domain/services/serviceItem'

export const SERVICE_STATUS_LABEL: Record<ServiceStatus, string> = {
  draft: 'Em planejamento',
  ready: 'Pronto',
  in_progress: 'Em andamento',
  completed: 'Realizado',
  cancelled: 'Cancelado',
}

export const SERVICE_TRANSITION_LABEL: Record<ServiceStatus, string> = {
  draft: 'Voltar para planejamento',
  ready: 'Marcar como pronto',
  in_progress: 'Iniciar serviço',
  completed: 'Concluir serviço',
  cancelled: 'Cancelar serviço',
}

export const SERVICE_ITEM_TYPE_LABEL: Record<ServiceItemType, string> = {
  song: 'Música',
  opening: 'Abertura',
  prayer: 'Oração',
  preaching: 'Pregação',
  announcement: 'Avisos',
  offering: 'Ofertas',
  closing: 'Encerramento',
  other: 'Outro',
}

/** ISO → valor de `<input type="datetime-local">` no fuso do aparelho. */
export function toLocalInput(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function formatServiceDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })
}
