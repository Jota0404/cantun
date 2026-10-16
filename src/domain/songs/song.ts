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
  /** Ausente = música pessoal; presente = cópia que pertence à organização (ADR-062). */
  organizationId?: string
  /** Música pessoal de origem da cópia. */
  sourceSongId?: string
  isFavorite: boolean
  createdAt: string
  updatedAt: string
}