export const MUSICAL_FUNCTIONS = ['vocals', 'electric-guitar', 'acoustic-guitar', 'bass', 'drums', 'keys', 'piano', 'strings', 'brass', 'woodwinds', 'other'] as const
export type MusicalFunctionId = typeof MUSICAL_FUNCTIONS[number]

/** Vaga (RN-01): uma função por serviço; mais pessoas na mesma função = quantidade maior. */
export interface ServicePosition {
  id: string
  serviceId: string
  musicalFunction: string
  quantity: number
  notes?: string
  createdAt: string
  updatedAt: string
}

export const POSITION_MAX_QUANTITY = 20
export const POSITION_NOTES_MAX = 500

export function validatePosition(input: { musicalFunction: string; quantity: number; notes?: string }): string[] {
  const errors: string[] = []
  if (!(MUSICAL_FUNCTIONS as readonly string[]).includes(input.musicalFunction)) errors.push('Função musical inválida.')
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > POSITION_MAX_QUANTITY) errors.push('A quantidade deve ser de 1 a 20.')
  if ((input.notes?.trim().length ?? 0) > POSITION_NOTES_MAX) errors.push('A observação pode ter até 500 caracteres.')
  return errors
}
