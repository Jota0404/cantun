import { setlistSongRepository, type SetlistSongRepository } from '../../db/repositories/setlistSongRepository'
import type { SetlistSong } from '../../domain/repertoires/setlistSong'

export async function listSetlistSongs(
  setlistId: string,
  repository: SetlistSongRepository = setlistSongRepository,
): Promise<SetlistSong[]> {
  return repository.listBySetlistId(setlistId)
}
