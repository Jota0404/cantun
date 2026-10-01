import { setlistRepository, type SetlistRepository } from '../../db/repositories/setlistRepository'
import { validateSetlistName } from '../../domain/repertoires/validateSetlist'
import type { Setlist } from '../../domain/repertoires/setlist'

export type RenameSetlistResult =
  | { success: true; setlist: Setlist }
  | { success: false; errors: ReturnType<typeof validateSetlistName>; message?: string }

export async function renameSetlist(
  setlistId: string,
  name: string,
  repository: SetlistRepository = setlistRepository,
): Promise<RenameSetlistResult> {
  const errors = validateSetlistName(name)
  if (errors.length > 0) {
    return { success: false, errors }
  }

  const setlist = await repository.getById(setlistId)
  if (!setlist) {
    return { success: false, errors: [], message: 'Repertório não encontrado.' }
  }

  const updated: Setlist = {
    ...setlist,
    name: name.trim(),
    updatedAt: new Date().toISOString(),
  }

  await repository.update(updated)
  return { success: true, setlist: updated }
}
