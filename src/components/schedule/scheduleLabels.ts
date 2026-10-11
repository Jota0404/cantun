import type { AssignmentAction } from '../../domain/services/assignmentLifecycle'
import type { AssignmentStatus } from '../../domain/services/assignment'
import type { AvailabilityStatus } from '../../domain/services/memberAvailability'

export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentStatus, string> = {
  invited: 'Convidado, aguardando resposta',
  confirmed: 'Confirmado',
  declined: 'Recusou',
  replacement_needed: 'Pediu substituição',
  cancelled: 'Cancelado',
}

export const ASSIGNMENT_ACTION_LABEL: Record<AssignmentAction, string> = {
  confirm: 'Confirmar',
  decline: 'Recusar',
  request_replacement: 'Pedir substituição',
  replace: 'Escolher substituto',
  cancel: 'Cancelar escala',
  resend_invite: 'Reenviar convite',
}

export const AVAILABILITY_LABEL: Record<AvailabilityStatus, string> = {
  available: 'Disponível',
  tentative: 'Talvez',
  unavailable: 'Indisponível',
}

export const OFFLINE_MESSAGE = 'Sem conexão: tente de novo quando estiver online.'
