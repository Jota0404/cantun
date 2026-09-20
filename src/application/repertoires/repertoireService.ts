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
