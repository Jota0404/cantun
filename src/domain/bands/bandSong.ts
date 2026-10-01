import type { MusicalKey } from '../music/musicalKey'

export interface BandSong {
  id: string
  bandId: string
  title: string
  artist?: string
  originalKey: MusicalKey
  bpm?: number
  lyrics: string
  notes?: string
  sourceSongId?: string
  createdAt: string
  updatedAt: string
}
