import { songRepository } from '../../db/repositories/songRepository'
import type { Song } from '../../domain/songs/song'
import { toSong } from '../../domain/songs/songRow'
import { rpc } from '../../platform/rpc'

export type CopyResult = { success: true; song: Song; created: boolean } | { success: false; errors: string[] }

export const OFFLINE_COPY_MESSAGE = 'Sem conexão: tente de novo quando estiver online.'

/**
 * RN-A3/A13: copia uma música pessoal para o Ministério (só online). Idempotente: se a cópia já existe
 * neste aparelho, reaproveita sem rede; o servidor também devolve a cópia existente. O editar da cópia não muda a pessoal.
 */
export async function copySongToOrganization(songId: string, organizationId: string): Promise<CopyResult> {
  const source = await songRepository.getById(songId)
  if (!source) return { success: false, errors: ['Essa música não está disponível neste aparelho. Sincronize e tente de novo.'] }
  if (source.organizationId) {
    return source.organizationId === organizationId
      ? { success: true, song: source, created: false }
      : { success: false, errors: [`"${source.title}" pertence a outro Ministério.`] }
  }
  const existing = await songRepository.findCopy(organizationId, songId)
  if (existing) return { success: true, song: existing, created: false }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { success: false, errors: [OFFLINE_COPY_MESSAGE] }
  try {
    const data = await rpc<Record<string, unknown> | Record<string, unknown>[] | null>('copy_song_to_organization', {
      p_song_id: songId, p_organization_id: organizationId, p_new_id: crypto.randomUUID(),
    })
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return { success: false, errors: ['Não foi possível copiar a música.'] }
    const song = toSong(row)
    await songRepository.putLocal(song)
    return { success: true, song, created: true }
  } catch (error) {
    return { success: false, errors: [error instanceof Error && error.message ? error.message : 'Não foi possível copiar a música.'] }
  }
}

/**
 * Para adicionar a repertório/serviço de um Ministério: devolve o id da música do próprio Ministério
 * (a cópia, se a escolhida for pessoal). Música de outro Ministério é recusada.
 */
export async function resolveOrganizationSong(songId: string, organizationId: string): Promise<{ success: true; songId: string; title: string } | { success: false; errors: string[] }> {
  const copy = await copySongToOrganization(songId, organizationId)
  return copy.success ? { success: true, songId: copy.song.id, title: copy.song.title } : copy
}
