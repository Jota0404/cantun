export type BandInviteRole = 'editor' | 'member'
export type BandInviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

export interface BandInvite {
  id: string
  bandId: string
  invitedByUserId: string
  role: BandInviteRole
  inviteeEmail?: string
  createdAt: string
  expiresAt: string
  acceptedAt?: string
  acceptedByUserId?: string
  revokedAt?: string
}
