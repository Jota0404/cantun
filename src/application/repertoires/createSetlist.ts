import type { Setlist } from '../../domain/repertoires/setlist'
import { validateSetlistName } from '../../domain/repertoires/validateSetlist'
import { setlistRepository, type SetlistRepository } from '../../db/repositories/setlistRepository'

export type CreateSetlistResult =
  | { success: true; setlist: Setlist }
  | { success: false; errors: ReturnType<typeof validateSetlistName> }

export async function createSetlist(
  name: string,
  repository: SetlistRepository = setlistRepository,
): Promise<CreateSetlistResult> {
  const errors = validateSetlistName(name)
  if (errors.length > 0) {
    return { success: false, errors }
  }

  const now = new Date().toISOString()
  const setlist: Setlist = {
    id: crypto.randomUUID(),
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
  }

  await repository.create(setlist)
  return { success: true, setlist }
}
