import type { Song } from '../../domain/songs/song'
import { validateSong } from '../../domain/songs/validateSong'
import type { SongValidationError } from '../../domain/songs/validateSong'
import { SongRepository, songRepository } from '../../db/repositories/songRepository'

/**
 * Fields provided by the user when creating a Song.
 * id, isFavorite, createdAt and updatedAt are managed by this use case.
 */
export type CreateSongInput = Omit<Song, 'id' | 'isFavorite' | 'createdAt' | 'updatedAt'>

export type CreateSongResult =
  | { success: true; song: Song }
  | { success: false; errors: SongValidationError[] }

export async function createSong(
  input: CreateSongInput,
  repository: SongRepository = songRepository
): Promise<CreateSongResult> {
  const errors = validateSong(input)

  if (errors.length > 0) {
    return { success: false, errors }
  }

  const now = new Date().toISOString()

  const song: Song = {
    ...input,
    id: crypto.randomUUID(),
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
  }

  await repository.create(song)

  return { success: true, song }
}