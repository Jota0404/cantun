import {
  setlistRepository,
  type SetlistRepository,
} from '../../db/repositories/setlistRepository'
import {
  setlistSongRepository,
  type SetlistSongRepository,
} from '../../db/repositories/setlistSongRepository'

export type DeleteSetlistResult =
  | { success: true }
  | { success: false; message: string }

export async function deleteSetlist(
  setlistId: string,
  dependencies: {
    setlists?: SetlistRepository
    setlistSongs?: SetlistSongRepository
  } = {},
): Promise<DeleteSetlistResult> {
  const setlists = dependencies.setlists ?? setlistRepository
  const setlistSongs = dependencies.setlistSongs ?? setlistSongRepository

  const setlist = await setlists.getById(setlistId)
  if (!setlist) {
    return { success: false, message: 'Repertório não encontrado.' }
  }

  const entries = await setlistSongs.listBySetlistId(setlistId)
  await Promise.all(entries.map((entry) => setlistSongs.remove(entry.id)))
  await setlists.remove(setlistId)

  return { success: true }
}
