import { MUSICAL_KEYS, type MusicalKey } from '../music/musicalKey'

export const SERVICE_ITEM_TYPES = ['song', 'opening', 'prayer', 'preaching', 'announcement', 'offering', 'closing', 'other', 'reprise', 'medley'] as const
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
  /** RN-10: só em `reprise`/`medley`; aponta para um item `song` do mesmo serviço. */
  refItemId?: string
  /** RN-06: tom de execução neste serviço; ausente = herda o tom atual da música. Só em `song`. */
  key?: MusicalKey
  updatedAt: string
}

export type ServiceItemInput = Pick<ServiceItem, 'type' | 'songId' | 'title' | 'notes' | 'durationMinutes' | 'refItemId'>

/** RN-10: reprise e medley são itens não musicais que voltam a uma música da ordem. */
const isRepriseType = (type: ServiceItemType) => type === 'reprise' || type === 'medley'

/** RN-04, RN-10. Retorna as mensagens de erro (vazio = válido). */
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
  if (isRepriseType(input.type) && !input.refItemId) errors.push('Escolha a música da reprise.')
  if (!isRepriseType(input.type) && input.refItemId) errors.push('Só reprise e medley apontam para outro item.')
  const minutes = input.durationMinutes
  if (minutes !== undefined && (!Number.isInteger(minutes) || minutes < 1 || minutes > 600)) errors.push('A duração deve ser de 1 a 600 minutos.')
  return errors
}

/** RN-10: o alvo precisa ser um item `song` do mesmo serviço. */
export function validateRepriseTarget(serviceId: string, refItemId: string, items: Pick<ServiceItem, 'id' | 'serviceId' | 'type'>[]): string[] {
  const target = items.find((item) => item.id === refItemId)
  return target && target.serviceId === serviceId && target.type === 'song' ? [] : ['A reprise deve voltar a uma música deste serviço.']
}

/** RN-10: título auto-gerado, dentro do limite de 120 caracteres. */
export function repriseTitle(type: 'reprise' | 'medley', songTitle: string): string {
  return `${type === 'reprise' ? 'Reprise' : 'Medley'}: ${songTitle}`.slice(0, 120)
}

/** RN-11: quantas reprises/medleys somem junto com o item (para a confirmação de exclusão). */
export function countDependents(items: Pick<ServiceItem, 'refItemId'>[], itemId: string): number {
  return items.filter((item) => item.refItemId === itemId).length
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

/** RN-07: tom válido, só em itens de música e do mesmo modo (maior/menor) do `originalKey`. */
export function validateServiceItemKey(item: Pick<ServiceItem, 'type'>, key: MusicalKey, song: { originalKey: MusicalKey }): string[] {
  if (item.type !== 'song') return ['Só itens de música têm tom.']
  if (!MUSICAL_KEYS.includes(key)) return ['Tom inválido.']
  if (key.endsWith('m') !== song.originalKey.endsWith('m')) return ['O tom deve ter o mesmo modo (maior/menor) da música.']
  return []
}

/** RN-08: tom do serviço, senão o tom atual da música. */
export function effectiveKey(item: Pick<ServiceItem, 'key'>, song: { currentKey: MusicalKey }): MusicalKey {
  return item.key ?? song.currentKey
}
