import {
  songRepository,
  type SongRepository,
} from '../../db/repositories/songRepository'
import type { Song } from '../../domain/songs/song'

export async function listSongs(
  repository: SongRepository = songRepository,
): Promise<Song[]> {
  return repository.list()
}