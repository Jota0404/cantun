import { stageSessionRepository } from '../../db/repositories/stageSessionRepository'
import { selectNextService } from '../../domain/home/nextService'
import { isFinalStatus } from '../../domain/services/serviceLifecycle'
import type { Service } from '../../domain/services/service'
import { serviceRepository } from '../../db/repositories/serviceRepository'
import { listMyOrganizations } from '../organizations/organizationService'
import { listManagedServiceGaps, listMyUpcomingAssignments, type ManagedServiceGap, type MyUpcomingAssignment } from '../services/scheduleService'

export interface HomeSummary {
  /** `false` → a UI mostra o onboarding (B2). */
  hasOrganization: boolean
  /** Próximo serviço do usuário (data, local, função, estado); ausente sem atribuições. */
  nextService?: MyUpcomingAssignment
  /** Atribuições minhas `invited` a confirmar, da mais próxima à mais distante. */
  pendingConfirmations: MyUpcomingAssignment[]
  /** Serviços com vagas abertas para quem gerencia (Líder/Admin/Owner). Vazio para os demais. */
  managedGaps: ManagedServiceGap[]
  /** Sessão de Palco `live` (atalho). */
  liveStage?: { stageSessionId: string; service: Service }
}

/** Início contextual (RN-13). Só lê o Dexie (offline); sem dados do B4, as listas vêm vazias. */
export async function getHomeSummary(now = new Date()): Promise<HomeSummary> {
  const organizations = await listMyOrganizations()
  if (organizations.length === 0) return { hasOrganization: false, pendingConfirmations: [], managedGaps: [] }

  const [mine, managedGaps, liveSessions] = await Promise.all([
    listMyUpcomingAssignments(now),
    listManagedServiceGaps(now),
    stageSessionRepository.listLive(),
  ])

  let liveStage: HomeSummary['liveStage']
  for (const session of liveSessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const service = await serviceRepository.getById(session.serviceId)
    if (service && !isFinalStatus(service.status) && organizations.some((o) => o.id === service.organizationId)) { liveStage = { stageSessionId: session.id, service }; break }
  }

  return {
    hasOrganization: true,
    nextService: selectNextService(mine),
    pendingConfirmations: mine.filter(({ assignment }) => assignment.status === 'invited'),
    managedGaps,
    liveStage,
  }
}
