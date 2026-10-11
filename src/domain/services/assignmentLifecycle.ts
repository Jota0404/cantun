import type { Assignment, AssignmentStatus } from './assignment'

// RN-03. As RPCs repetem a tabela; o banco decide.
const TRANSITIONS: Record<AssignmentStatus, readonly AssignmentStatus[]> = {
  invited: ['confirmed', 'declined', 'cancelled'],
  confirmed: ['replacement_needed', 'cancelled'],
  replacement_needed: ['cancelled'],
  declined: [],
  cancelled: [],
}

export function canAssignmentTransition(from: AssignmentStatus, to: AssignmentStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

/** Conta na quantidade da vaga (RN-09). */
export function isActiveAssignment(status: AssignmentStatus): boolean {
  return status === 'invited' || status === 'confirmed'
}

/** Ainda ocupa a pessoa naquela vaga (índice único do banco). */
export function holdsPosition(status: AssignmentStatus): boolean {
  return status === 'invited' || status === 'confirmed' || status === 'replacement_needed'
}

export type AssignmentAction = 'confirm' | 'decline' | 'request_replacement' | 'replace' | 'cancel' | 'resend_invite'

/** Ações disponíveis na UI: só o titular responde (RN-04); gestor = `schedule.manage` na equipe do serviço. */
export function availableAssignmentActions(
  assignment: Pick<Assignment, 'status' | 'userId'>,
  actorUserId: string,
  canManage: boolean,
  serviceIsFinal: boolean,
): AssignmentAction[] {
  if (serviceIsFinal) return []
  const holder = assignment.userId === actorUserId
  const actions: AssignmentAction[] = []
  if (assignment.status === 'invited' && holder) actions.push('confirm', 'decline')
  if (assignment.status === 'confirmed' && (holder || canManage)) actions.push('request_replacement')
  if (assignment.status === 'replacement_needed' && canManage) actions.push('replace')
  if (canManage && canAssignmentTransition(assignment.status, 'cancelled')) actions.push('cancel')
  if (assignment.status === 'invited' && canManage) actions.push('resend_invite')
  return actions
}
