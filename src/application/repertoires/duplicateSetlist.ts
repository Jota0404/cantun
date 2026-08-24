import {
  setlistRepository,
  type SetlistRepository,
} from '../../db/repositories/setlistRepository'
import {
  setlistSongRepository,
  type SetlistSongRepository,
} from '../../db/repositories/setlistSongRepository'
import type { Setlist } from '../../domain/repertoires/setlist'
import type { SetlistSong } from '../../domain/repertoires/setlistSong'

export type DuplicateSetlistResult =
  | { success: true; setlist: Setlist }
  | { success: false; message: string }

export async function duplicateSetlist(
  setlistId: string,
  dependencies: {
    setlists?: SetlistRepository
    setlistSongs?: SetlistSongRepository
  } = {},
): Promise<DuplicateSetlistResult> {
  const setlists = dependencies.setlists ?? setlistRepository
  const setlistSongs = dependencies.setlistSongs ?? setlistSongRepository

  const source = await setlists.getById(setlistId)
  if (!source) {
    return { success: false, message: 'Repertório não encontrado.' }
  }

  const entries = await setlistSongs.listBySetlistId(setlistId)
  const now = new Date().toISOString()
  const duplicated: Setlist = {
    id: crypto.randomUUID(),
    name: `${source.name} (cópia)`,
    createdAt: now,
    updatedAt: now,
  }

  await setlists.create(duplicated)

  const createdEntries: SetlistSong[] = []
  try {
    for (const entry of entries) {
      const duplicatedEntry: SetlistSong = {
        id: crypto.randomUUID(),
        setlistId: duplicated.id,
        songId: entry.songId,
        position: entry.position,
      }
      await setlistSongs.create(duplicatedEntry)
      createdEntries.push(duplicatedEntry)
    }
  } catch (error) {
    await Promise.all(createdEntries.map((entry) => setlistSongs.remove(entry.id)))
    await setlists.remove(duplicated.id)
    throw error
  }

  return { success: true, setlist: duplicated }
}
