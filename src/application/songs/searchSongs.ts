import { filterSongs } from '../../domain/songs/filterSongs'
import type { Song } from '../../domain/songs/song'
import { listSongs } from './listSongs'

/** Seletor com busca (RN-A2): músicas do aparelho filtradas por título/artista, sem as já usadas. */
export async function searchSongs(query: string, exclude?: ReadonlySet<string>): Promise<Song[]> {
  return filterSongs(await listSongs(), query, exclude)
}
