import { filterSongs } from '../../domain/songs/filterSongs'
import type { Song } from '../../domain/songs/song'
import { listOrganizationSongs } from './listOrganizationSongs'
import { listSongs } from './listSongs'

/** Seletor com busca (RN-A2): biblioteca pessoal ou, com `scope`, as músicas do Ministério; sem as já usadas. */
export async function searchSongs(query: string, exclude?: ReadonlySet<string>, scope?: { organizationId: string }): Promise<Song[]> {
  return filterSongs(scope ? await listOrganizationSongs(scope.organizationId) : await listSongs(), query, exclude)
}
