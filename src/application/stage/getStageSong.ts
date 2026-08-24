import type { SongRepository } from '../../db/repositories/songRepository'
import { songRepository as defaultSongRepository } from '../../db/repositories/songRepository'
import type { Song } from '../../domain/songs/song'

export async function getStageSong(
  songId: string,
  repository: SongRepository = defaultSongRepository,
): Promise<Song | undefined> {
  return repository.getById(songId)
}
