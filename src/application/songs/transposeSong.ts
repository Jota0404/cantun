import type { MusicalKey } from '../../domain/music/musicalKey'
import { transposeKey } from '../../domain/music/transpose'
import type { Song } from '../../domain/songs/song'
import { songRepository, type SongRepository } from '../../db/repositories/songRepository'

export type TransposeSongInput = { id: string; semitones: number }
export type TransposeSongResult =
  | { success: true; song: Song }
  | { success: false; error: { field: 'id'; message: string } }

export async function transposeSong(
  input: TransposeSongInput,
  repository: SongRepository = songRepository,
): Promise<TransposeSongResult> {
  const song = await repository.getById(input.id)
  if (!song) {
    return { success: false, error: { field: 'id', message: 'Música não encontrada.' } }
  }

  const currentKey: MusicalKey = transposeKey(song.currentKey, input.semitones)
  const updatedSong: Song = {
    ...song,
    currentKey,
    lyrics: song.lyrics,
    updatedAt: new Date().toISOString(),
  }

  await repository.update(updatedSong)
  return { success: true, song: updatedSong }
}
