import { setlistRepository, type SetlistRepository } from '../../db/repositories/setlistRepository'
import type { Setlist } from '../../domain/repertoires/setlist'

export async function listSetlists(
  repository: SetlistRepository = setlistRepository,
): Promise<Setlist[]> {
  return repository.list()
}
