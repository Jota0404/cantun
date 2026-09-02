export type BandMemberRole = 'member' | 'md'

export interface BandMember {
  id: string
  bandId: string
  userId: string
  role: BandMemberRole
  createdAt: string
  updatedAt: string
}
