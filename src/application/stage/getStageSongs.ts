import type { SetlistSong } from '../../domain/repertoires/setlistSong'
import type { Song } from '../../domain/songs/song'
import type { SetlistSongRepository } from '../../db/repositories/setlistSongRepository'
import { setlistSongRepository as defaultSetlistSongRepository } from '../../db/repositories/setlistSongRepository'
import type { SongRepository } from '../../db/repositories/songRepository'
import { songRepository as defaultSongRepository } from '../../db/repositories/songRepository'

export async function getStageSongs(
  setlistId: string,
  dependencies: {
    setlistSongs?: SetlistSongRepository
    songs?: SongRepository
  } = {},
): Promise<Array<{ entry: SetlistSong; song: Song }>> {
  const setlistSongs = dependencies.setlistSongs ?? defaultSetlistSongRepository
  const songs = dependencies.songs ?? defaultSongRepository

  const [entries, allSongs] = await Promise.all([
    setlistSongs.listBySetlistId(setlistId),
    songs.list(),
  ])

  const songsById = new Map(allSongs.map((song) => [song.id, song]))

  return entries
    .map((entry) => ({ entry, song: songsById.get(entry.songId) }))
    .filter((item): item is { entry: SetlistSong; song: Song } => Boolean(item.song))
}
