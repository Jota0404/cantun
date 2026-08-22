import type { MusicalKey } from '../music/musicalKey'

export interface Song {
  id: string
  title: string
  artist?: string
  originalKey: MusicalKey
  currentKey: MusicalKey
  bpm?: number
  lyrics: string
  notes?: string
  isFavorite: boolean
  createdAt: string
  updatedAt: string
}