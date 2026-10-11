import type { Assignment } from './assignment'
import type { ServicePosition } from './servicePosition'

export interface PositionGap {
  position: ServicePosition
  confirmed: number
  /** Convidados aguardando resposta. */
  invited: number
  /** Lacuna: `quantity − confirmed` (RN-06). */
  missing: number
  /** Vagas sem nenhum convite: `missing − invited`. */
  uninvited: number
  state: 'open' | 'filled'
}

/** RN-06: o estado é derivado, nunca gravado. */
export function positionGap(position: ServicePosition, assignments: Pick<Assignment, 'positionId' | 'status'>[]): PositionGap {
  const mine = assignments.filter((assignment) => assignment.positionId === position.id)
  const confirmed = mine.filter((assignment) => assignment.status === 'confirmed').length
  const invited = mine.filter((assignment) => assignment.status === 'invited').length
  const missing = Math.max(0, position.quantity - confirmed)
  return { position, confirmed, invited, missing, uninvited: Math.max(0, missing - invited), state: missing === 0 ? 'filled' : 'open' }
}

export function serviceGaps(positions: ServicePosition[], assignments: Pick<Assignment, 'positionId' | 'status'>[]) {
  const gaps = positions.map((position) => positionGap(position, assignments))
  return { gaps, openCount: gaps.filter((gap) => gap.state === 'open').length, missingTotal: gaps.reduce((sum, gap) => sum + gap.missing, 0) }
}
