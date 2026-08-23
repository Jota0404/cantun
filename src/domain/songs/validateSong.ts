import type { Song } from './song'

/**
 * Subset of Song fields subject to validation.
 * id, isFavorite, createdAt and updatedAt are managed by the
 * application/infrastructure layers and are not user input.
 */
export type SongValidationInput = Pick<
  Song,
  'title' | 'originalKey' | 'currentKey' | 'lyrics' | 'bpm'
>

export type SongValidationField = keyof SongValidationInput

export interface SongValidationError {
  field: SongValidationField
  message: string
}

const BPM_MIN = 1
const BPM_MAX = 999

export function validateSong(song: SongValidationInput): SongValidationError[] {
  const errors: SongValidationError[] = []

  if (!song.title || song.title.trim().length === 0) {
    errors.push({ field: 'title', message: 'Título é obrigatório.' })
  }

  if (!song.originalKey) {
    errors.push({ field: 'originalKey', message: 'Tom original é obrigatório.' })
  }

  if (!song.currentKey) {
    errors.push({ field: 'currentKey', message: 'Tom atual é obrigatório.' })
  }

  if (!song.lyrics || song.lyrics.trim().length === 0) {
    errors.push({ field: 'lyrics', message: 'Cifra/letra é obrigatória.' })
  }

  if (song.bpm !== undefined) {
    if (!Number.isInteger(song.bpm) || song.bpm < BPM_MIN || song.bpm > BPM_MAX) {
      errors.push({
        field: 'bpm',
        message: `BPM deve ser um número inteiro entre ${BPM_MIN} e ${BPM_MAX}.`,
      })
    }
  }

  return errors
}

export function isSongValid(song: SongValidationInput): boolean {
  return validateSong(song).length === 0
}