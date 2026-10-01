import {
  songRepository,
  type SongRepository,
} from '../../db/repositories/songRepository'
import type { Song } from '../../domain/songs/song'

export async function getSongById(
  id: string,
  repository: SongRepository = songRepository,
): Promise<Song | undefined> {
  return repository.getById(id)
}