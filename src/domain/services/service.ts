export type ServiceStatus = 'planned' | 'confirmed' | 'completed' | 'cancelled'

export interface Service {
  id: string
  organizationId: string
  name: string
  startsAt: string
  status: ServiceStatus
  createdByUserId: string
  createdAt: string
  updatedAt: string
}
