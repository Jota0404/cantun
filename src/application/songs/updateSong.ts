import type { Song } from '../../domain/songs/song'
import {
  validateSong,
  type SongValidationError,
  type SongValidationInput,
} from '../../domain/songs/validateSong'
import {
  songRepository,
  type SongRepository,
} from '../../db/repositories/songRepository'

export type UpdateSongInput = SongValidationInput & {
  id: Song['id']
}

export type UpdateSongResult =
  | { success: true; song: Song }
  | { success: false; errors: SongValidationError[] }

export async function updateSong(
  input: UpdateSongInput,
  repository: SongRepository = songRepository,
): Promise<UpdateSongResult> {
  const errors = validateSong(input)

  if (errors.length > 0) {
    return {
      success: false,
      errors,
    }
  }

  const existingSong = await repository.getById(input.id)

  if (!existingSong) {
    return {
      success: false,
      errors: [
        {
          field: 'title',
          message: 'Música não encontrada.',
        },
      ],
    }
  }

  const song: Song = {
    ...existingSong,
    title: input.title,
    originalKey: input.originalKey,
    currentKey: input.currentKey,
    lyrics: input.lyrics,
    bpm: input.bpm,
    updatedAt: new Date().toISOString(),
  }

  await repository.update(song)

  return {
    success: true,
    song,
  }
}