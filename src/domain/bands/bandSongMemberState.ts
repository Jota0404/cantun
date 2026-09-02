import type { MusicalKey } from '../music/musicalKey'

export interface BandSongMemberState {
  id: string
  bandSongId: string
  userId: string
  currentKey: MusicalKey
  createdAt: string
  updatedAt: string
}
