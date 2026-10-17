import type { PersonalRepertoireSummary } from '../../application/repertoires/repertoireService'

/** Subtítulo da lista de repertórios pessoais (RN-C2): até 3 nomes de músicas e "+N". */
export function summarySongs({ songTitles, moreCount }: PersonalRepertoireSummary): string {
  if (songTitles.length === 0) return 'Sem músicas'
  return songTitles.join(', ') + (moreCount > 0 ? ` +${moreCount}` : '')
}
