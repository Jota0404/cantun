import {
  setlistRepository,
  type SetlistRepository,
} from '../../db/repositories/setlistRepository'
import {
  setlistSongRepository,
  type SetlistSongRepository,
} from '../../db/repositories/setlistSongRepository'
import type { SetlistSong } from '../../domain/repertoires/setlistSong'

export type ReorderSetlistResult =
  | { success: true; entries: SetlistSong[] }
  | { success: false; message: string }

export async function reorderSetlist(
  setlistId: string,
  fromPosition: number,
  toPosition: number,
  dependencies: {
    setlists?: SetlistRepository
    setlistSongs?: SetlistSongRepository
  } = {},
): Promise<ReorderSetlistResult> {
  const setlists = dependencies.setlists ?? setlistRepository
  const setlistSongs = dependencies.setlistSongs ?? setlistSongRepository

  if (!(await setlists.getById(setlistId))) {
    return { success: false, message: 'Repertório não encontrado.' }
  }

  const entries = await setlistSongs.listBySetlistId(setlistId)
  if (
    fromPosition < 0 ||
    toPosition < 0 ||
    fromPosition >= entries.length ||
    toPosition >= entries.length
  ) {
    return { success: false, message: 'Posição de música inválida.' }
  }

  if (fromPosition === toPosition) {
    return { success: true, entries }
  }

  const reordered = [...entries]
  const [moved] = reordered.splice(fromPosition, 1)
  if (!moved) {
    return { success: false, message: 'Música não encontrada na posição informada.' }
  }
  reordered.splice(toPosition, 0, moved)

  const updatedEntries = reordered.map((entry, position) => ({ ...entry, position }))
  await Promise.all(updatedEntries.map((entry) => setlistSongRepository.update(entry)))

  const setlist = await setlists.getById(setlistId)
  if (setlist) {
    await setlists.update({ ...setlist, updatedAt: new Date().toISOString() })
  }

  return { success: true, entries: updatedEntries }
}
