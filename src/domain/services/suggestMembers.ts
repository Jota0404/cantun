import type { Assignment } from './assignment'
import { holdsPosition } from './assignmentLifecycle'
import type { AvailabilityStatus } from './memberAvailability'

export interface SuggestionCandidate {
  userId: string
  /** Só membros ativos da equipe do serviço entram (o chamador filtra). */
  functions: string[]
}

export interface MemberSuggestion {
  userId: string
  hasFunction: boolean
  availability?: AvailabilityStatus
  /** `unavailable` marcado ao fim (RN-12); `busy`: já escalado em outro serviço no mesmo horário. */
  warnings: Array<'unavailable' | 'busy'>
}

/** RN-12. A disponibilidade sugere, nunca bloqueia. */
export function suggestMembers(input: {
  candidates: SuggestionCandidate[]
  musicalFunction: string
  /** Todas as atribuições da vaga, em qualquer estado. */
  positionAssignments: Pick<Assignment, 'userId' | 'status'>[]
  availabilityByUser: Record<string, AvailabilityStatus | undefined>
  busyUserIds: ReadonlySet<string>
}): MemberSuggestion[] {
  const taken = new Set(input.positionAssignments.filter((a) => holdsPosition(a.status)).map((a) => a.userId))
  const declined = new Set(input.positionAssignments.filter((a) => a.status === 'declined').map((a) => a.userId))
  const rank = (suggestion: MemberSuggestion) => {
    if (suggestion.availability === 'unavailable') return 4
    if (!suggestion.hasFunction) return 3
    return suggestion.availability === 'available' ? 0 : suggestion.availability === 'tentative' ? 1 : 2
  }
  return input.candidates
    .filter((candidate) => !taken.has(candidate.userId) && !declined.has(candidate.userId))
    .map((candidate): MemberSuggestion => {
      const availability = input.availabilityByUser[candidate.userId]
      const warnings: MemberSuggestion['warnings'] = []
      if (availability === 'unavailable') warnings.push('unavailable')
      if (input.busyUserIds.has(candidate.userId)) warnings.push('busy')
      return { userId: candidate.userId, hasFunction: candidate.functions.includes(input.musicalFunction), availability, warnings }
    })
    .sort((a, b) => rank(a) - rank(b))
}
