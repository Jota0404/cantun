import { createSong } from './createSong'
import type { CreateSongInput, CreateSongResult } from './createSong'
import { parseSongText } from '../../domain/songs/parseSongText'
import type { SongRepository } from '../../db/repositories/songRepository'

export type ImportSongFromTextResult =
  | { success: true; input: CreateSongInput }
  | { success: false; errors: string[] }

export function importSongFromText(text: string): ImportSongFromTextResult {
  const result = parseSongText(text)

  if (!result.success) {
    return result
  }

  return { success: true, input: result.data }
}

export async function createImportedSong(
  input: CreateSongInput,
  repository?: SongRepository,
): Promise<CreateSongResult> {
  return createSong(input, repository)
}
