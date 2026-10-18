import type { Repertoire } from '../../domain/repertoires/repertoire'
import type { RepertoireItem } from '../../domain/repertoires/repertoireItem'
import { repertoireRepository } from '../../db/repositories/repertoireRepository'
import { repertoireItemRepository } from '../../db/repositories/repertoireItemRepository'
import { songRepository } from '../../db/repositories/songRepository'
import { resolveOrganizationSong } from '../songs/copySongToOrganization'
import type { Organization } from '../../domain/organizations/organization'
import type { Song } from '../../domain/songs/song'
import { listMyOrganizations } from '../organizations/organizationService'
import { toSong } from '../../domain/songs/songRow'
import { rpc } from '../../platform/rpc'
import { getCurrentUser } from '../../platform/auth'
import { hasPermission } from '../../domain/access/permissions'
import { getMyAccessContext } from '../teams/teamMemberService'
import { OFFLINE_COPY_MESSAGE } from '../songs/copySongToOrganization'

/** Repertórios agrupados por organização (Dexie, offline). */
export async function listRepertoireGroups(): Promise<Array<{ organization: Organization; repertoires: Repertoire[] }>> {
  const organizations = await listMyOrganizations()
  return Promise.all(organizations.map(async (organization) => ({ organization, repertoires: await repertoireRepository.listByOrganizationId(organization.id) })))
}

export interface RepertoireDetail {
  repertoire: Repertoire
  items: Array<RepertoireItem & { song?: Song }>
}

/** Repertório com as músicas resolvidas, na ordem (Dexie, offline). */
export async function getRepertoireDetail(repertoireId: string): Promise<RepertoireDetail | undefined> {
  const repertoire = await repertoireRepository.getById(repertoireId)
  if (!repertoire) return undefined
  const items = await repertoireItemRepository.listByRepertoireId(repertoireId)
  return { repertoire, items: await Promise.all(items.map(async (item) => ({ ...item, song: await songRepository.getById(item.songId) }))) }
}

export async function createRepertoire(input: Omit<Repertoire, 'id' | 'createdAt' | 'updatedAt'>, id = crypto.randomUUID()): Promise<Repertoire> {
  const now = new Date().toISOString()
  const value: Repertoire = { ...input, id, createdAt: now, updatedAt: now }
  await repertoireRepository.create(value)
  return value
}

/** RN-A7/A3: a música precisa existir neste aparelho, ser do Ministério (ou pessoal, copiada) e não estar repetida. Lança `Error` com a razão em pt-BR. */
export async function addSongToRepertoire(repertoireId: string, songId: string, id = crypto.randomUUID()): Promise<RepertoireItem> {
  const repertoire = await repertoireRepository.getById(repertoireId)
  if (!repertoire) throw new Error('Repertório não encontrado.')
  let title: string
  if (repertoire.organizationId) {
    // RN-A3: música pessoal entra como cópia do Ministério (só online); a do Ministério entra direto.
    const resolved = await resolveOrganizationSong(songId, repertoire.organizationId)
    if (!resolved.success) throw new Error(resolved.errors.join(' '))
    songId = resolved.songId
    title = resolved.title
  } else {
    // RN-C1/P1: repertório pessoal só usa a biblioteca do dono, offline.
    const song = await songRepository.getById(songId)
    if (!song) throw new Error('Essa música não está disponível neste aparelho. Sincronize e tente de novo.')
    if (song.organizationId) throw new Error(`"${song.title}" é do Ministério: repertório pessoal usa só a sua biblioteca.`)
    title = song.title
  }
  if (await repertoireItemRepository.findByRepertoireAndSong(repertoireId, songId)) throw new Error(`"${title}" já está neste repertório.`)
  const items = await repertoireItemRepository.listByRepertoireId(repertoireId)
  const value: RepertoireItem = { id, repertoireId, songId, position: items.length, updatedAt: new Date().toISOString() }
  await repertoireItemRepository.create(value)
  return value
}


export async function renameRepertoire(repertoireId: string, name: string): Promise<Repertoire> {
  const current = await repertoireRepository.getById(repertoireId)
  if (!current) throw new Error('Repertório não encontrado.')
  const trimmed = name.trim()
  if (!trimmed) throw new Error('O nome do repertório é obrigatório.')
  const value = { ...current, name: trimmed, updatedAt: new Date().toISOString(), version: current.version + 1 }
  await repertoireRepository.update(value)
  return value
}

export async function removeSongFromRepertoire(repertoireId: string, itemId: string): Promise<void> {
  const item = await repertoireItemRepository.getById(itemId)
  if (!item || item.repertoireId !== repertoireId) throw new Error('Música não encontrada no repertório.')
  await repertoireItemRepository.remove(itemId)
  const remaining = await repertoireItemRepository.listByRepertoireId(repertoireId)
  for (let index = 0; index < remaining.length; index += 1) {
    const next = remaining[index]
    if (next.position !== index) await repertoireItemRepository.update({ ...next, position: index, updatedAt: new Date().toISOString() })
  }
}

export async function reorderRepertoire(repertoireId: string, orderedItemIds: string[]): Promise<RepertoireItem[]> {
  const items = await repertoireItemRepository.listByRepertoireId(repertoireId)
  if (items.length !== orderedItemIds.length || new Set(orderedItemIds).size !== items.length || orderedItemIds.some((id) => !items.some((item) => item.id === id))) {
    throw new Error('A ordem informada não corresponde ao repertório.')
  }
  const now = new Date().toISOString()
  const result: RepertoireItem[] = []
  for (let index = 0; index < orderedItemIds.length; index += 1) {
    const item = items.find((entry) => entry.id === orderedItemIds[index])!
    const next = { ...item, position: index, updatedAt: now }
    await repertoireItemRepository.update(next)
    result.push(next)
  }
  return result
}

export async function deleteRepertoire(repertoireId: string): Promise<void> {
  const items = await repertoireItemRepository.listByRepertoireId(repertoireId)
  for (const item of items) await repertoireItemRepository.remove(item.id)
  await repertoireRepository.remove(repertoireId)
}

/** RN-05: "Cópia de …", mesmas músicas e ordem, mesmo escopo; o autor é o usuário. Organização exige `repertoire.create`. */
export async function duplicateRepertoire(repertoireId: string): Promise<Repertoire> {
  const current = await repertoireRepository.getById(repertoireId)
  if (!current) throw new Error('Repertório não encontrado.')
  const user = getCurrentUser()
  if (!user) throw new Error('Entre na sua conta para duplicar o repertório.')
  if (current.organizationId && !hasPermission(await getMyAccessContext({ organizationId: current.organizationId }), 'repertoire.create')) {
    throw new Error('Você não tem permissão para criar repertórios neste Ministério.')
  }
  const copy = await createRepertoire({ organizationId: current.organizationId, name: `Cópia de ${current.name}`, createdByUserId: user.id, version: 1 })
  const now = new Date().toISOString()
  const items = await repertoireItemRepository.listByRepertoireId(repertoireId)
  try {
    await repertoireItemRepository.createMany(items.map((item) => ({ ...item, id: crypto.randomUUID(), repertoireId: copy.id, updatedAt: now })))
  } catch (error) {
    await repertoireRepository.remove(copy.id)
    throw error
  }
  return copy
}

export interface PersonalRepertoireSummary {
  repertoire: Repertoire
  /** Até 3 títulos, na ordem do repertório. */
  songTitles: string[]
  /** Músicas além das listadas em `songTitles`. */
  moreCount: number
}

/** RN-C1/C2: repertórios pessoais do usuário com um resumo das músicas (Dexie, offline). */
export async function listPersonalRepertoires(userId: string): Promise<PersonalRepertoireSummary[]> {
  const repertoires = await repertoireRepository.listPersonal(userId)
  return Promise.all(repertoires.map(async (repertoire) => {
    const titles = (await getRepertoireDetail(repertoire.id))?.items.flatMap((item) => item.song ? [item.song.title] : []) ?? []
    return { repertoire, songTitles: titles.slice(0, 3), moreCount: Math.max(0, titles.length - 3) }
  }))
}

export type ImportRepertoireResult =
  | { success: true; repertoire: Repertoire; copied: number; reused: number }
  | { success: false; errors: string[] }

/**
 * RN-C2: copia um repertório pessoal para o Ministério (RPC, só online). O servidor cria o repertório, as cópias
 * das músicas (reaproveitando as existentes) e os itens na mesma ordem; o aparelho só grava o que ele devolveu.
 */
export async function importPersonalRepertoire(repertoireId: string, organizationId: string): Promise<ImportRepertoireResult> {
  const source = await repertoireRepository.getById(repertoireId)
  if (!source || source.organizationId) return { success: false, errors: ['Repertório pessoal não encontrado.'] }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { success: false, errors: [OFFLINE_COPY_MESSAGE] }
  try {
    const data = await rpc<Record<string, unknown> | null>('import_personal_repertoire', {
      p_repertoire_id: repertoireId, p_organization_id: organizationId, p_new_id: crypto.randomUUID(),
    })
    if (!data) return { success: false, errors: ['Não foi possível importar o repertório.'] }
    const row = data.repertoire as Record<string, unknown>
    const repertoire: Repertoire = {
      id: String(row.id), organizationId: String(row.organization_id), name: String(row.name), createdByUserId: String(row.created_by_user_id),
      version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    }
    for (const song of data.songs as Record<string, unknown>[]) await songRepository.putLocal(toSong(song))
    await repertoireRepository.putLocal(repertoire)
    await repertoireItemRepository.putLocal((data.items as Record<string, unknown>[]).map((item) => ({
      id: String(item.id), repertoireId: String(item.repertoire_id), songId: String(item.song_id), position: Number(item.position), updatedAt: String(item.updated_at),
    })))
    return { success: true, repertoire, copied: Number(data.copied), reused: Number(data.reused) }
  } catch (error) {
    return { success: false, errors: [error instanceof Error && error.message ? error.message : 'Não foi possível importar o repertório.'] }
  }
}
