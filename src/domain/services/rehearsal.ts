import type { ServiceItem } from './serviceItem'

/** RN-19…21: ensaio de um serviço, com as músicas em foco. */
export interface Rehearsal {
  id: string
  organizationId: string
  serviceId: string
  startsAt: string
  location?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface RehearsalSong {
  rehearsalId: string
  serviceItemId: string
}

export const rehearsalSongId = (rehearsalId: string, serviceItemId: string) => `${rehearsalId}:${serviceItemId}`

export function validateRehearsal(input: { startsAt: string; location?: string; serviceItemIds: string[] }, serviceItems: ServiceItem[]): string[] {
  const errors: string[] = []
  if (!input.startsAt || Number.isNaN(Date.parse(input.startsAt))) errors.push('Informe uma data e hora válidas para o ensaio.')
  if (input.location && input.location.trim().length > 120) errors.push('O local deve ter no máximo 120 caracteres.')
  if (new Set(input.serviceItemIds).size !== input.serviceItemIds.length) errors.push('Uma música não pode se repetir no ensaio.')
  const songIds = new Set(serviceItems.filter((i) => i.type === 'song').map((i) => i.id))
  if (input.serviceItemIds.some((id) => !songIds.has(id))) errors.push('Só músicas deste serviço podem ficar em foco.')
  return errors
}
