import { setlistRepository, type SetlistRepository } from '../../db/repositories/setlistRepository'
import { setlistSongRepository, type SetlistSongRepository } from '../../db/repositories/setlistSongRepository'
import type { SetlistSong } from '../../domain/repertoires/setlistSong'

export type AddSongToSetlistResult =
  | { success: true; entry: SetlistSong }
  | { success: false; message: string }

export async function addSongToSetlist(
  setlistId: string,
  songId: string,
  dependencies: {
    setlists?: SetlistRepository
    setlistSongs?: SetlistSongRepository
  } = {},
): Promise<AddSongToSetlistResult> {
  const setlists = dependencies.setlists ?? setlistRepository
  const setlistSongs = dependencies.setlistSongs ?? setlistSongRepository

  if (!(await setlists.getById(setlistId))) {
    return { success: false, message: 'Repertório não encontrado.' }
  }

  const existing = await setlistSongs.findBySetlistAndSong(setlistId, songId)
  if (existing) {
    return { success: false, message: 'A música já está no repertório.' }
  }

  const entries = await setlistSongs.listBySetlistId(setlistId)
  const now = new Date().toISOString()
  const entry: SetlistSong = {
    id: crypto.randomUUID(),
    setlistId,
    songId,
    position: entries.length,
    updatedAt: now,
  }

  await setlistSongs.create(entry)

  const setlist = await setlists.getById(setlistId)
  if (setlist) {
    await setlists.update({ ...setlist, updatedAt: now })
  }

  return { success: true, entry }
}
