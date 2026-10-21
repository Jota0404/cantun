import { hasPermission, type AccessContext } from '../../domain/access/permissions'
import type { Repertoire } from '../../domain/repertoires/repertoire'
import type { MusicalKey } from '../../domain/music/musicalKey'
import { validateServiceItemKey, type ServiceItem } from '../../domain/services/serviceItem'
import { isFinalStatus } from '../../domain/services/serviceLifecycle'
import { repertoireItemRepository } from '../../db/repositories/repertoireItemRepository'
import { repertoireRepository } from '../../db/repositories/repertoireRepository'
import { songRepository } from '../../db/repositories/songRepository'
import { serviceItemRepository } from '../../db/repositories/serviceItemRepository'
import { serviceRepository } from '../../db/repositories/serviceRepository'
import { getMyAccessContext } from '../teams/teamMemberService'

export interface ApplyRepertoireRepositories {
  repertoires: typeof repertoireRepository
  repertoireItems: typeof repertoireItemRepository
  items: typeof serviceItemRepository
  songs: typeof songRepository
  services: typeof serviceRepository
  access: (input: { organizationId: string; teamId?: string }) => Promise<AccessContext>
}

const defaults: ApplyRepertoireRepositories = {
  repertoires: repertoireRepository, repertoireItems: repertoireItemRepository, items: serviceItemRepository, songs: songRepository, services: serviceRepository, access: getMyAccessContext,
}

export interface ApplyRepertoireInput {
  repertoireId: string
  /** Músicas marcadas, na ordem escolhida (RN-02). */
  songIds: string[]
  /** Insere depois deste item da ordem; ausente = no fim (RN-03). */
  afterItemId?: string
}

export type ApplyRepertoireResult = { success: true; items: ServiceItem[]; added: number } | { success: false; errors: string[] }

/** Repertórios que podem ser aplicados ao serviço: os da mesma organização (RN-01). Dexie, offline. */
export async function listApplicableRepertoires(serviceId: string, repositories = defaults): Promise<Repertoire[]> {
  const service = await repositories.services.getById(serviceId)
  return service ? repositories.repertoires.listByOrganizationId(service.organizationId) : []
}

/**
 * RN-01…04: cria itens `song` a partir do repertório, sem ligá-los a ele. Músicas já na ordem são ignoradas (RN-A8).
 * Criação e renumeração são gravadas e enfileiradas atomicamente (unique de posição deferida).
 */
export async function applyRepertoireToService(serviceId: string, input: ApplyRepertoireInput, repositories = defaults): Promise<ApplyRepertoireResult> {
  const service = await repositories.services.getById(serviceId)
  if (!service) return { success: false, errors: ['Serviço não encontrado.'] }
  if (isFinalStatus(service.status)) return { success: false, errors: ['Serviço encerrado não pode ser editado.'] }
  const access = await repositories.access({ organizationId: service.organizationId, teamId: service.teamId ?? undefined })
  if (!hasPermission(access, 'service.edit')) return { success: false, errors: ['Você não tem permissão para editar a ordem deste serviço.'] }
  const repertoire = await repositories.repertoires.getById(input.repertoireId)
  if (!repertoire || repertoire.organizationId !== service.organizationId) return { success: false, errors: ['Escolha um repertório do mesmo Ministério do serviço.'] }

  const repertoireSongIds = new Set((await repositories.repertoireItems.listByRepertoireId(repertoire.id)).map((item) => item.songId))
  if (input.songIds.some((songId) => !repertoireSongIds.has(songId))) return { success: false, errors: ['Há músicas que não pertencem ao repertório.'] }

  for (const songId of input.songIds) if (!(await repositories.songs.getById(songId))) return { success: false, errors: ['Há músicas indisponíveis neste aparelho. Sincronize e tente de novo.'] }
  const current = await repositories.items.listByServiceId(service.id)
  const inOrder = new Set(current.flatMap((item) => item.type === 'song' && item.songId ? [item.songId] : []))
  const songIds = [...new Set(input.songIds)].filter((songId) => !inOrder.has(songId))
  if (songIds.length === 0) return { success: false, errors: ['Nenhuma música nova para adicionar: marque ao menos uma que ainda não esteja na ordem.'] }

  let at = current.length
  if (input.afterItemId) {
    const after = current.findIndex((item) => item.id === input.afterItemId)
    if (after < 0) return { success: false, errors: ['Item de referência não encontrado na ordem.'] }
    at = after + 1
  }
  const now = new Date().toISOString()
  const added: ServiceItem[] = songIds.map((songId) => ({ id: crypto.randomUUID(), serviceId: service.id, type: 'song', songId, position: 0, updatedAt: now }))
  const ordered = [...current.slice(0, at), ...added, ...current.slice(at)]
  // Uma transação só: o sync nunca vê itens novos sem os antigos já renumerados.
  await repositories.items.saveMany(ordered.flatMap((item, position) => added.includes(item) || item.position !== position ? [{ ...item, position, updatedAt: now }] : []))
  await repositories.services.update({ ...service, updatedAt: now })
  return { success: true, items: await repositories.items.listByServiceId(service.id), added: added.length }
}

/** RN-06…09: define (ou limpa, com `undefined`) o tom do item neste serviço; não toca a música. */
export async function setServiceItemKey(
  itemId: string,
  key: MusicalKey | undefined,
  repositories = defaults,
): Promise<{ success: true; item: ServiceItem } | { success: false; errors: string[] }> {
  const item = await repositories.items.getById(itemId)
  if (!item) return { success: false, errors: ['Item não encontrado.'] }
  const service = await repositories.services.getById(item.serviceId)
  if (!service) return { success: false, errors: ['Serviço não encontrado.'] }
  if (isFinalStatus(service.status)) return { success: false, errors: ['Serviço encerrado não pode ser editado.'] }
  const access = await repositories.access({ organizationId: service.organizationId, teamId: service.teamId ?? undefined })
  if (!hasPermission(access, 'service.edit')) return { success: false, errors: ['Você não tem permissão para editar a ordem deste serviço.'] }
  if (key) {
    const song = item.songId ? await repositories.songs.getById(item.songId) : undefined
    if (item.type === 'song' && !song) return { success: false, errors: ['Música indisponível neste aparelho. Sincronize e tente de novo.'] }
    const errors = validateServiceItemKey(item, key, song ?? { originalKey: key })
    if (errors.length) return { success: false, errors }
  }
  const next: ServiceItem = { ...item, key, updatedAt: new Date().toISOString() }
  if (!key) delete next.key
  await repositories.items.update(next)
  return { success: true, item: next }
}
