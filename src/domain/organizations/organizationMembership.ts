export type OrganizationAccessRole = 'owner' | 'admin' | 'member'

export interface OrganizationMembership {
  id: string
  organizationId: string
  userId: string
  role: OrganizationAccessRole
  createdAt: string
  updatedAt: string
}
