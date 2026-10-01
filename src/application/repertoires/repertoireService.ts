import type { Repertoire } from '../../domain/repertoires/repertoire'
import type { RepertoireItem } from '../../domain/repertoires/repertoireItem'
import { repertoireRepository } from '../../db/repositories/repertoireRepository'
import { repertoireItemRepository } from '../../db/repositories/repertoireItemRepository'

export async function createRepertoire(input: Omit<Repertoire, 'id' | 'createdAt' | 'updatedAt'>, id = crypto.randomUUID()): Promise<Repertoire> {
  const now = new Date().toISOString()
  const value: Repertoire = { ...input, id, createdAt: now, updatedAt: now }
  await repertoireRepository.create(value)
  return value
}

export async function addSongToRepertoire(repertoireId: string, songId: string, id = crypto.randomUUID()): Promise<RepertoireItem> {
  const existing = await repertoireItemRepository.findByRepertoireAndSong(repertoireId, songId)
  if (existing) return existing
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

export async function duplicateRepertoire(repertoireId: string, name?: string): Promise<Repertoire> {
  const current = await repertoireRepository.getById(repertoireId)
  if (!current) throw new Error('Repertório não encontrado.')
  const copy = await createRepertoire({
    organizationId: current.organizationId,
    name: name?.trim() || current.name + ' (cópia)',
    createdByUserId: current.createdByUserId,
    version: 1,
  })
  const items = await repertoireItemRepository.listByRepertoireId(repertoireId)
  for (const item of items) {
    await repertoireItemRepository.create({ ...item, id: crypto.randomUUID(), repertoireId: copy.id })
  }
  return copy
}
