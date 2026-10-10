export const SERVICE_ITEM_TYPES = ['song', 'opening', 'prayer', 'preaching', 'announcement', 'offering', 'closing', 'other'] as const
export type ServiceItemType = typeof SERVICE_ITEM_TYPES[number]

export interface ServiceItem {
  id: string
  serviceId: string
  type: ServiceItemType
  /** Só em `type = 'song'` (RN-04). */
  songId?: string
  /** Obrigatório fora de `song` (1–120). */
  title?: string
  notes?: string
  durationMinutes?: number
  position: number
  repertoireId?: string
  updatedAt: string
}

export type ServiceItemInput = Pick<ServiceItem, 'type' | 'songId' | 'title' | 'notes' | 'durationMinutes'>

/** RN-04. Retorna as mensagens de erro (vazio = válido). */
export function validateServiceItem(input: ServiceItemInput): string[] {
  const errors: string[] = []
  if (!SERVICE_ITEM_TYPES.includes(input.type)) errors.push('Tipo de item inválido.')
  if (input.type === 'song') {
    if (!input.songId) errors.push('Escolha a música.')
  } else {
    if (input.songId) errors.push('Só itens de música têm música vinculada.')
    const title = input.title?.trim() ?? ''
    if (title.length < 1 || title.length > 120) errors.push('Informe um título de 1 a 120 caracteres.')
  }
  const minutes = input.durationMinutes
  if (minutes !== undefined && (!Number.isInteger(minutes) || minutes < 1 || minutes > 600)) errors.push('A duração deve ser de 1 a 600 minutos.')
  return errors
}

/** RN-05: posições contíguas a partir de 0, na ordem recebida. Devolve só os itens que mudaram. */
export function renumber<T extends { position: number }>(ordered: T[]): T[] {
  return ordered.flatMap((item, index) => item.position === index ? [] : [{ ...item, position: index }])
}

/** Move um item para `toIndex` (limitado às bordas) e renumera; independe do tipo. */
export function moveItem<T extends { id: string; position: number }>(items: T[], itemId: string, toIndex: number): T[] {
  const ordered = [...items].sort((a, b) => a.position - b.position)
  const from = ordered.findIndex((item) => item.id === itemId)
  if (from < 0) return []
  const [moved] = ordered.splice(from, 1)
  ordered.splice(Math.max(0, Math.min(toIndex, ordered.length)), 0, moved)
  return renumber(ordered)
}
