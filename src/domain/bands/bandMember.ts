export type BandMemberRole = 'owner' | 'editor' | 'member'

export interface BandMember {
  id: string
  bandId: string
  userId: string
  role: BandMemberRole
  createdAt: string
  updatedAt: string
}
