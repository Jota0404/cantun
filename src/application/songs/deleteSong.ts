import {
  setlistSongRepository,
  type SetlistSongRepository,
} from '../../db/repositories/setlistSongRepository'
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
  setlistSongs: SetlistSongRepository = setlistSongRepository,
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

  const relationships = await setlistSongs.listBySongId(id)

  await Promise.all(
    relationships.map((relationship) => setlistSongs.remove(relationship.id)),
  )

  await repository.remove(id)

  return {
    success: true,
  }
}
