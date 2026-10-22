import type { AccessContext } from '../../domain/access/permissions'
import type { MusicalKey } from '../../domain/music/musicalKey'
import { effectiveKey, type ServiceItemType } from '../../domain/services/serviceItem'
import { assignmentRepository } from '../../db/repositories/assignmentRepository'
import { serviceItemRepository } from '../../db/repositories/serviceItemRepository'
import { serviceRepository } from '../../db/repositories/serviceRepository'
import { songRepository } from '../../db/repositories/songRepository'
import { getCurrentUser } from '../../platform/auth'
import { servicePreparationRepository } from '../../db/repositories/servicePreparationRepository'
import { preparationId } from '../../domain/services/servicePreparation'
import { buildRehearsalViews, defaultRehearsalRepositories, type RehearsalRepositories, type RehearsalView } from './rehearsalService'
import { getMyAccessContext } from '../teams/teamMemberService'

export interface MemberPreparationItem {
  id: string
  type: ServiceItemType
  songId?: string
  title: string
  artist?: string
  /** Só em `song`; RN-08. */
  effectiveKey?: MusicalKey
  bpm?: number
  /** RN-13: o "arranjo" é a observação do item. */
  notes?: string
  /** Reprise/medley: posição (1-based) do item alvo na lista ordenada. */
  refPosition?: number
}

export interface MemberPreparationView {
  serviceId: string
  serviceName: string
  startsAt: string
  /** `null` = sem escala. */
  myFunction: string | null
  items: MemberPreparationItem[]
  serviceNotes?: string
  /** RN-15: estado próprio de "preparado". */
  prepared: boolean
  rehearsals: RehearsalView[]
  /** Fatia 7: ainda não existe. */
  materials: never[]
}

export interface MemberPreparationRepositories {
  services: typeof serviceRepository
  items: typeof serviceItemRepository
  songs: typeof songRepository
  assignments: typeof assignmentRepository
  preparations: typeof servicePreparationRepository
  access: (input: { organizationId: string; teamId?: string }) => Promise<AccessContext>
  currentUserId: () => string | undefined
  rehearsals: RehearsalRepositories
}

const defaults: MemberPreparationRepositories = {
  services: serviceRepository, items: serviceItemRepository, songs: songRepository, assignments: assignmentRepository, preparations: servicePreparationRepository,
  access: getMyAccessContext, currentUserId: () => getCurrentUser()?.id, rehearsals: defaultRehearsalRepositories,
}

export type MemberPreparationResult = { success: true; view: MemberPreparationView } | { success: false; errors: string[] }

/** RN-12…14: agregado de leitura 100% local. Leitura: membro ativo da organização (a escala é que decide a função). */
export async function getMemberPreparationView(serviceId: string, repositories = defaults): Promise<MemberPreparationResult> {
  const service = await repositories.services.getById(serviceId)
  if (!service) return { success: false, errors: ['Serviço não encontrado.'] }
  const access = await repositories.access({ organizationId: service.organizationId, teamId: service.teamId ?? undefined })
  if (!access.organizationRole || access.isActiveInOrganization === false) return { success: false, errors: ['Você não tem acesso a este serviço.'] }

  const userId = repositories.currentUserId()
  const [assignments, items] = await Promise.all([repositories.assignments.listByServiceId(serviceId), repositories.items.listByServiceId(serviceId)])
  const mine = userId ? assignments.find((a) => a.userId === userId && (a.status === 'invited' || a.status === 'confirmed')) : undefined
  const prepared = userId ? Boolean(await repositories.preparations.get(preparationId(serviceId, userId))) : false
  const ordered = [...items].sort((a, b) => a.position - b.position)
  const view: MemberPreparationItem[] = await Promise.all(ordered.map(async (item) => {
    const song = item.songId ? await repositories.songs.getById(item.songId) : undefined
    const refIndex = item.refItemId ? ordered.findIndex((o) => o.id === item.refItemId) : -1
    return {
      id: item.id, type: item.type, songId: item.songId, title: song?.title ?? item.title ?? (item.type === 'song' ? 'Música indisponível offline' : ''), artist: song?.artist,
      refPosition: refIndex >= 0 ? refIndex + 1 : undefined,
      effectiveKey: song ? effectiveKey(item, song) : undefined, bpm: song?.bpm, notes: item.notes,
    }
  }))
  return {
    success: true,
    view: { serviceId, serviceName: service.name, startsAt: service.startsAt, myFunction: mine?.musicalFunction ?? null, items: view, serviceNotes: service.notes, prepared, rehearsals: await buildRehearsalViews(serviceId, repositories.rehearsals), materials: [] },
  }
}
