import { setlistRepository, type SetlistRepository } from '../../db/repositories/setlistRepository'
import { setlistSongRepository, type SetlistSongRepository } from '../../db/repositories/setlistSongRepository'

export type RemoveSongFromSetlistResult =
  | { success: true }
  | { success: false; message: string }

export async function removeSongFromSetlist(
  setlistId: string,
  songId: string,
  dependencies: {
    setlists?: SetlistRepository
    setlistSongs?: SetlistSongRepository
  } = {},
): Promise<RemoveSongFromSetlistResult> {
  const setlists = dependencies.setlists ?? setlistRepository
  const setlistSongs = dependencies.setlistSongs ?? setlistSongRepository
  const entry = await setlistSongs.findBySetlistAndSong(setlistId, songId)

  if (!entry) {
    return { success: false, message: 'A música não está no repertório.' }
  }

  const entries = await setlistSongs.listBySetlistId(setlistId)
  await setlistSongs.remove(entry.id)

  await Promise.all(
    entries
      .filter((current) => current.id !== entry.id && current.position > entry.position)
      .map((current) => setlistSongs.update({ ...current, position: current.position - 1 })),
  )

  const setlist = await setlists.getById(setlistId)
  if (setlist) {
    await setlists.update({ ...setlist, updatedAt: new Date().toISOString() })
  }

  return { success: true }
}
