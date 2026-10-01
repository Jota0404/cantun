export type BandMemberRole = 'owner' | 'editor' | 'member'

import type { MusicalRole } from './musicalRole'

export interface BandMember {
  id: string
  bandId: string
  userId: string
  role: BandMemberRole
  musicalRole?: MusicalRole
  createdAt: string
  updatedAt: string
}
