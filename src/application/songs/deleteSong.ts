import {
  songRepository,
  type SongRepository,
} from '../../db/repositories/songRepository'

export type DeleteSongResult =
  | { success: true }
  | {
      success: false
      error: {
        field: 'id'
        message: string
      }
    }

export async function deleteSong(
  id: string,
  repository: SongRepository = songRepository,
): Promise<DeleteSongResult> {
  const existingSong = await repository.getById(id)

  if (!existingSong) {
    return {
      success: false,
      error: {
        field: 'id',
        message: 'Música não encontrada.',
      },
    }
  }

  await repository.remove(id)

  return {
    success: true,
  }
}