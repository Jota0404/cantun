import type { ServiceStatus } from './service'

// ADR-052 / RN-02. A RPC `transition_service` repete esta tabela; o banco decide.
const TRANSITIONS: Record<ServiceStatus, readonly ServiceStatus[]> = {
  draft: ['ready', 'cancelled'],
  ready: ['draft', 'in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export function canTransition(from: ServiceStatus, to: ServiceStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

export function nextStatuses(from: ServiceStatus): readonly ServiceStatus[] {
  return TRANSITIONS[from]
}

/** RN-06: serviço final não aceita edição de informações nem da ordem. */
export function isFinalStatus(status: ServiceStatus): boolean {
  return status === 'completed' || status === 'cancelled'
}

/** S7: o Líder só exclui em `draft`; Owner e Admin sempre. `canDelete` = `hasPermission(ctx, 'service.delete')`. */
export function canDeleteService(status: ServiceStatus, canDelete: boolean, isOrganizationAdmin: boolean): boolean {
  return canDelete && (isOrganizationAdmin || status === 'draft')
}
