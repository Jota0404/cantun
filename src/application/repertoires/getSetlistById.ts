import { setlistRepository, type SetlistRepository } from '../../db/repositories/setlistRepository'
import type { Setlist } from '../../domain/repertoires/setlist'

export async function getSetlistById(
  id: string,
  repository: SetlistRepository = setlistRepository,
): Promise<Setlist | undefined> {
  return repository.getById(id)
}
