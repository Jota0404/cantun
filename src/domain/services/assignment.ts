export type AssignmentStatus = 'invited' | 'confirmed' | 'declined' | 'replacement_needed' | 'cancelled'

/** Autoridade do servidor: o cliente só lê (pull) e muda por RPC. */
export interface Assignment {
  id: string
  serviceId: string
  /** `null` só em dado local antigo até o próximo pull (upgrade v14). */
  positionId: string | null
  userId: string
  musicalFunction: string
  serviceItemId?: string
  status: AssignmentStatus
  respondedAt?: string
  replacedAssignmentId?: string
  inviteSentAt?: string
  createdAt: string
  updatedAt: string
}

export function toAssignment(row: Record<string, unknown>): Assignment {
  const text = (value: unknown) => value ? String(value) : undefined
  return {
    id: String(row.id), serviceId: String(row.service_id), positionId: row.position_id ? String(row.position_id) : null,
    userId: String(row.user_id), musicalFunction: String(row.musical_function), serviceItemId: text(row.service_item_id),
    status: row.status as AssignmentStatus, respondedAt: text(row.responded_at), replacedAssignmentId: text(row.replaced_assignment_id),
    inviteSentAt: text(row.invite_sent_at), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  }
}
