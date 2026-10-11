export type AvailabilityStatus = 'available' | 'unavailable' | 'tentative'
export const AVAILABILITY_NOTE_MAX = 200

/** RN-10: por membro e dia (`YYYY-MM-DD`), vale para todos os serviços da data. */
export interface MemberAvailability {
  id: string
  userId: string
  organizationId: string
  date: string
  status: AvailabilityStatus
  note?: string
  createdAt: string
  updatedAt: string
}

/** Dia local de um instante ISO. */
export function availabilityDate(iso: string): string {
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function validateAvailability(input: { date: string; status: AvailabilityStatus; note?: string }): string[] {
  const errors: string[] = []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date))) errors.push('Informe uma data válida.')
  if (!['available', 'unavailable', 'tentative'].includes(input.status)) errors.push('Disponibilidade inválida.')
  if ((input.note?.trim().length ?? 0) > AVAILABILITY_NOTE_MAX) errors.push('A nota pode ter até 200 caracteres.')
  return errors
}
