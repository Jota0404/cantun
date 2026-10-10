export type ServiceStatus = 'draft' | 'ready' | 'in_progress' | 'completed' | 'cancelled'

export interface Service {
  id: string
  organizationId: string
  /** RN-01. `null` só em dados locais antigos até o próximo pull (upgrade v13). */
  teamId: string | null
  name: string
  startsAt: string
  location?: string
  notes?: string
  /** Autoridade do servidor: muda só por `transition_service`; o pull sobrescreve sem LWW. */
  status: ServiceStatus
  createdByUserId: string
  createdAt: string
  updatedAt: string
}
