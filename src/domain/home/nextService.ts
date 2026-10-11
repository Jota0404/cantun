import type { AssignmentStatus } from '../services/assignment'
import type { ServiceStatus } from '../services/service'

interface Candidate {
  assignment: { status: AssignmentStatus }
  service: { startsAt: string; status: ServiceStatus }
}

/**
 * RN-13: o "próximo serviço" do usuário. Um serviço em andamento vem primeiro; depois o mais próximo;
 * no mesmo horário, a atribuição confirmada vence a apenas convidada. Ignora declinadas e canceladas.
 */
export function selectNextService<T extends Candidate>(candidates: T[]): T | undefined {
  const rank = (candidate: T) => (candidate.service.status === 'in_progress' ? 0 : 1)
  return candidates
    .filter(({ assignment }) => assignment.status === 'confirmed' || assignment.status === 'invited' || assignment.status === 'replacement_needed')
    .sort((a, b) =>
      rank(a) - rank(b)
      || a.service.startsAt.localeCompare(b.service.startsAt)
      || Number(b.assignment.status === 'confirmed') - Number(a.assignment.status === 'confirmed'))[0]
}
