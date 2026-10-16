import type { Song } from './song'

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** RN-A2: busca por título e artista, sem diferenciar caixa nem acento; `exclude` tira o que já está na ordem. */
export function filterSongs(songs: Song[], query: string, exclude: ReadonlySet<string> = new Set()): Song[] {
  const terms = fold(query).split(/\s+/).filter(Boolean)
  return songs
    .filter((song) => !exclude.has(song.id))
    .filter((song) => {
      const haystack = fold(`${song.title} ${song.artist ?? ''}`)
      return terms.every((term) => haystack.includes(term))
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))
}
