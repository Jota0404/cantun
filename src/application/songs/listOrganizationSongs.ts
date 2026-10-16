import { songRepository } from '../../db/repositories/songRepository'
import type { Song } from '../../domain/songs/song'

/** Músicas do Ministério (as cópias), do Dexie (offline). */
export function listOrganizationSongs(organizationId: string, repository = songRepository): Promise<Song[]> {
  return repository.listByOrganization(organizationId)
}
