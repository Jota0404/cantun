import type { Organization } from '../domain/organizations/organization'
import type { OrganizationMembership } from '../domain/organizations/organizationMembership'
import type { Team } from '../domain/teams/team'
import type { TeamMembership } from '../domain/teams/teamMembership'
import type { Repertoire } from '../domain/repertoires/repertoire'
import type { RepertoireItem } from '../domain/repertoires/repertoireItem'
import type { Service } from '../domain/services/service'
import type { ServiceItem } from '../domain/services/serviceItem'
import { toAssignment, type Assignment } from '../domain/services/assignment'
import type { ServicePosition } from '../domain/services/servicePosition'
import type { MemberAvailability } from '../domain/services/memberAvailability'
import type { StageSession } from '../domain/stage/stageSession'
import type { StageSessionState } from '../domain/stage/stageSessionState'
import { toStageSessionState } from '../domain/stage/stageSessionState'
import { rpc } from '../platform/rpc'
import { ApiError } from '../platform/http'
import { notifyRemoteDataApplied } from './remoteChanges'
import { deleteRows, selectRows, updateRows, upsertRows } from '../platform/sync'
import type { SalmodiaDatabase } from '../db/database'

export type TargetEntityName =
  | 'organizations'
  | 'organizationMemberships'
  | 'teams'
  | 'teamMemberships'
  | 'repertoires'
  | 'repertoireItems'
  | 'services'
  | 'serviceItems'
  | 'assignments'
  | 'servicePositions'
  | 'memberAvailability'
  | 'stageSessions'
  | 'stageSessionStates'

export type TargetEntity =
  | Organization
  | OrganizationMembership
  | Team
  | TeamMembership
  | Repertoire
  | RepertoireItem
  | Service
  | ServiceItem
  | Assignment
  | ServicePosition
  | MemberAvailability
  | StageSession
  | StageSessionState

// Sessão e estado do Palco só mudam por RPC (`create_target_stage_session`, `target_stage_*`);
// o `cantum_user` só tem SELECT nessas tabelas, então elas são só pull.
// Têm `unique` por conteúdo no banco, com id gerado no cliente: 409 no push = outro aparelho criou o mesmo.
const UNIQUE_BY_CONTENT: readonly TargetEntityName[] = ['servicePositions', 'memberAvailability']

// `organization_songs` saiu na 0007 (ADR-062): a música do Ministério é uma cópia em `songs`.
const REMOVED_ENTITIES = ['organizationSongs'] as const

const READ_ONLY_ENTITIES = ['stageSessions', 'stageSessionStates', 'assignments'] as const

export type TargetWritableEntityName = Exclude<TargetEntityName, typeof READ_ONLY_ENTITIES[number]>

export type TargetWritableEntity =
  | Organization
  | OrganizationMembership
  | Team
  | TeamMembership
  | Repertoire
  | RepertoireItem
  | Service
  | ServiceItem
  | ServicePosition
  | MemberAvailability

export interface TargetSyncQueueItem {
  id?: number
  entity: TargetWritableEntityName
  entityId: string
  operation: 'upsert' | 'delete'
  payload?: TargetWritableEntity
  updatedAt: string
  attempts: number
  /** `failed`: recusado pelo servidor (4xx permanente); não é mais retentado até ser descartado. */
  status?: 'failed'
  lastError?: string
}

export interface SyncStatus {
  pending: number
  failed: Array<{ id: number; entity: string; reason: string }>
}

// Erro permanente: o servidor entendeu e recusou (403, 409…); repetir não muda nada. 408 e 429 são transitórios.
export function isPermanent(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429
}

const BATCHED_ENTITIES = ['serviceItems', 'repertoireItems'] as const
const batchKey = (item: TargetSyncQueueItem) =>
  item.entity === 'serviceItems' ? (item.payload as ServiceItem).serviceId : (item.payload as RepertoireItem).repertoireId

const tables: Record<TargetEntityName, string> = {
  organizations: 'organizations',
  organizationMemberships: 'organization_memberships',
  teams: 'teams',
  teamMemberships: 'team_memberships',
  repertoires: 'repertoires',
  repertoireItems: 'repertoire_items',
  services: 'services',
  serviceItems: 'service_items',
  assignments: 'assignments',
  servicePositions: 'service_positions',
  memberAvailability: 'member_availability',
  stageSessions: 'stage_sessions',
  stageSessionStates: 'stage_session_states',
}

function toRemoteRow(entity: TargetWritableEntityName, value: TargetWritableEntity) {
  switch (entity) {
    case 'organizations': {
      const v = value as Organization
      return { id: v.id, name: v.name, created_at: v.createdAt, updated_at: v.updatedAt }
    }
    case 'organizationMemberships': {
      const v = value as OrganizationMembership
      return { id: v.id, organization_id: v.organizationId, user_id: v.userId, role: v.role, created_at: v.createdAt, updated_at: v.updatedAt }
    }
    case 'teams': {
      const v = value as Team
      return { id: v.id, organization_id: v.organizationId, name: v.name, created_at: v.createdAt, updated_at: v.updatedAt }
    }
    case 'teamMemberships': {
      const v = value as TeamMembership
      // Sem `role`/`status`: só mudam por RPC (N15).
      return { id: v.id, team_id: v.teamId, user_id: v.userId, created_at: v.createdAt, updated_at: v.updatedAt }
    }
    case 'repertoires': {
      const v = value as Repertoire
      return { id: v.id, organization_id: v.organizationId ?? null, name: v.name, created_by_user_id: v.createdByUserId, version: v.version, created_at: v.createdAt, updated_at: v.updatedAt }
    }
    case 'repertoireItems': {
      const v = value as RepertoireItem
      return { id: v.id, repertoire_id: v.repertoireId, song_id: v.songId, position: v.position, updated_at: v.updatedAt }
    }
    case 'services': {
      const v = value as Service
      // Sem `status`: só muda por `transition_service` (RN-03).
      return { id: v.id, organization_id: v.organizationId, team_id: v.teamId, name: v.name, starts_at: v.startsAt, location: v.location ?? null, notes: v.notes ?? null, created_by_user_id: v.createdByUserId, created_at: v.createdAt, updated_at: v.updatedAt }
    }
    case 'serviceItems': {
      const v = value as ServiceItem
      return { id: v.id, service_id: v.serviceId, type: v.type, song_id: v.songId ?? null, title: v.title ?? null, notes: v.notes ?? null, duration_minutes: v.durationMinutes ?? null, position: v.position, repertoire_id: v.repertoireId ?? null, updated_at: v.updatedAt }
    }
    case 'servicePositions': {
      const v = value as ServicePosition
      return { id: v.id, service_id: v.serviceId, musical_function: v.musicalFunction, quantity: v.quantity, notes: v.notes ?? null, created_at: v.createdAt, updated_at: v.updatedAt }
    }
    case 'memberAvailability': {
      const v = value as MemberAvailability
      return { id: v.id, user_id: v.userId, organization_id: v.organizationId, date: v.date, status: v.status, note: v.note ?? null, created_at: v.createdAt, updated_at: v.updatedAt }
    }
  }
}

function fromRemoteRow(entity: TargetEntityName, row: Record<string, unknown>): TargetEntity {
  switch (entity) {
    case 'organizations': return { id: String(row.id), name: String(row.name), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
    case 'organizationMemberships': return { id: String(row.id), organizationId: String(row.organization_id), userId: String(row.user_id), role: row.role as OrganizationMembership['role'], createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
    case 'teams': return { id: String(row.id), organizationId: String(row.organization_id), name: String(row.name), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
    case 'teamMemberships': return { id: String(row.id), teamId: String(row.team_id), userId: String(row.user_id), role: row.role === 'leader' ? 'leader' : 'member', status: row.status === 'inactive' ? 'inactive' : 'active', createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
    case 'repertoires': return { id: String(row.id), organizationId: row.organization_id ? String(row.organization_id) : undefined, name: String(row.name), createdByUserId: String(row.created_by_user_id), version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
    case 'repertoireItems': return { id: String(row.id), repertoireId: String(row.repertoire_id), songId: String(row.song_id), position: Number(row.position), updatedAt: String(row.updated_at) }
    case 'services': return { id: String(row.id), organizationId: String(row.organization_id), teamId: row.team_id ? String(row.team_id) : null, name: String(row.name), startsAt: String(row.starts_at), location: row.location ? String(row.location) : undefined, notes: row.notes ? String(row.notes) : undefined, status: row.status as Service['status'], createdByUserId: String(row.created_by_user_id), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
    case 'serviceItems': return { id: String(row.id), serviceId: String(row.service_id), type: (row.type ?? 'song') as ServiceItem['type'], songId: row.song_id ? String(row.song_id) : undefined, title: row.title ? String(row.title) : undefined, notes: row.notes ? String(row.notes) : undefined, durationMinutes: row.duration_minutes == null ? undefined : Number(row.duration_minutes), position: Number(row.position), repertoireId: row.repertoire_id ? String(row.repertoire_id) : undefined, updatedAt: String(row.updated_at) }
    case 'assignments': return toAssignment(row)
    case 'servicePositions': return { id: String(row.id), serviceId: String(row.service_id), musicalFunction: String(row.musical_function), quantity: Number(row.quantity), notes: row.notes ? String(row.notes) : undefined, createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
    case 'memberAvailability': return { id: String(row.id), userId: String(row.user_id), organizationId: String(row.organization_id), date: String(row.date).slice(0, 10), status: row.status as MemberAvailability['status'], note: row.note ? String(row.note) : undefined, createdAt: String(row.created_at ?? row.updated_at), updatedAt: String(row.updated_at) }
    case 'stageSessions': return { id: String(row.id), serviceId: String(row.service_id), mdUserId: row.md_user_id ? String(row.md_user_id) : undefined, status: row.status as StageSession['status'], createdAt: String(row.created_at), startedAt: row.started_at ? String(row.started_at) : undefined, endedAt: row.ended_at ? String(row.ended_at) : undefined, updatedAt: String(row.updated_at) }
    case 'stageSessionStates': return toStageSessionState(row)
  }
}

function localTable(db: SalmodiaDatabase, entity: TargetEntityName) {
  const map = {
    organizations: db.organizations,
    organizationMemberships: db.organizationMemberships,
    teams: db.teams,
    teamMemberships: db.teamMemberships,
    repertoires: db.repertoires,
    repertoireItems: db.repertoireItems,
    services: db.services,
    serviceItems: db.serviceItems,
    assignments: db.assignments,
    servicePositions: db.servicePositions,
    memberAvailability: db.memberAvailability,
    stageSessions: db.stageSessions,
    stageSessionStates: db.stageSessionStates,
  }
  return map[entity]
}

export class TargetSyncEngine {
  private syncing = false
  private retryTimer: number | undefined
  private readonly db: SalmodiaDatabase
  constructor(db: SalmodiaDatabase) {
    this.db = db
  }

  async queueUpsert(entity: TargetWritableEntityName, payload: TargetWritableEntity): Promise<void> {
    await this.db.targetSyncQueue.where('[entity+entityId]').equals([entity, payload.id]).delete()
    await this.db.targetSyncQueue.add({ entity, entityId: payload.id, operation: 'upsert', payload, updatedAt: payload.updatedAt, attempts: 0 })
    void this.sync()
  }

  async queueDelete(entity: TargetWritableEntityName, entityId: string, updatedAt = new Date().toISOString()): Promise<void> {
    await this.db.targetSyncQueue.where('[entity+entityId]').equals([entity, entityId]).delete()
    await this.db.targetSyncQueue.add({ entity, entityId, operation: 'delete', updatedAt, attempts: 0 })
    void this.sync()
  }

  private failure(item: TargetSyncQueueItem, error: unknown): Partial<TargetSyncQueueItem> {
    const attempts = item.attempts + 1
    return isPermanent(error) ? { attempts, status: 'failed', lastError: error.message } : { attempts }
  }

  /** `true` quando a entidade não tem mais alteração na fila: o servidor aceitou o que o aparelho enviou. */
  async isSent(entity: TargetWritableEntityName, entityId: string): Promise<boolean> {
    return (await this.db.targetSyncQueue.where('[entity+entityId]').equals([entity, entityId]).count()) === 0
  }

  async getStatus(): Promise<SyncStatus> {
    const items = await this.db.targetSyncQueue.toArray()
    const failed = items.filter((i) => i.status === 'failed' && i.id !== undefined)
    return { pending: items.length - failed.length, failed: failed.map((i) => ({ id: i.id!, entity: i.entity, reason: i.lastError ?? '' })) }
  }

  /** Descarta as alterações recusadas: some da fila e do aparelho; o próximo pull traz a versão do servidor. */
  async discardFailed(): Promise<void> {
    const failed = await this.db.targetSyncQueue.filter((i) => i.status === 'failed').toArray()
    for (const item of failed) {
      if (item.operation === 'upsert') await localTable(this.db, item.entity).delete(item.entityId)
      if (item.id !== undefined) await this.db.targetSyncQueue.delete(item.id)
    }
    void this.sync()
  }

  async createOrganization(value: Organization): Promise<void> {
    await rpc('create_organization', { p_id: value.id, p_name: value.name })
    await this.db.organizations.put(value)
  }

  // `role`/`status` são do servidor: sobrescrevem sem LWW (VS-01). O vínculo otimista do criador
  // (id local diferente) é trocado pelo do servidor pela chave [teamId+userId].
  private async applyTeamMembership(remote: TeamMembership): Promise<void> {
    await this.db.transaction('rw', this.db.teamMemberships, async () => {
      const optimistic = await this.db.teamMemberships.where('[teamId+userId]').equals([remote.teamId, remote.userId]).first()
      if (optimistic && optimistic.id !== remote.id) await this.db.teamMemberships.delete(optimistic.id)
      const local = await this.db.teamMemberships.get(remote.id)
      const base = local && local.updatedAt > remote.updatedAt ? local : remote
      await this.db.teamMemberships.put({ ...base, role: remote.role, status: remote.status })
    })
  }

  async sync(): Promise<void> {
    if (this.syncing || !navigator.onLine) return
    this.syncing = true
    try {
      // Itens de entidades só-leitura enfileirados por versões antigas nunca seriam aceitos.
      await this.db.targetSyncQueue.where('entity').anyOf([...READ_ONLY_ENTITIES, ...REMOVED_ENTITIES]).delete()
      const pending = (await this.db.targetSyncQueue.orderBy('id').toArray()).filter((p) => p.status !== 'failed')
      const done = new Set<number | undefined>()
      for (const item of pending) {
        if (done.has(item.id)) continue
        // Itens do mesmo serviço (ou repertório) sobem num só lote (uma transação no servidor; unique de posição deferida).
        if ((BATCHED_ENTITIES as readonly string[]).includes(item.entity) && item.operation === 'upsert') {
          const key = batchKey(item)
          const batch = pending.filter((p) => !done.has(p.id) && p.entity === item.entity && p.operation === 'upsert' && batchKey(p) === key)
          for (const p of batch) done.add(p.id)
          try {
            await upsertRows(tables[item.entity], batch.map((p) => toRemoteRow(item.entity, p.payload!)))
            await this.db.targetSyncQueue.bulkDelete(batch.flatMap((p) => p.id === undefined ? [] : [p.id]))
          } catch (error) {
            // 4xx permanente recusa o lote inteiro (uma transação): não dá para separar itens da mesma ordem
            // sem quebrar a unique de posição. O servidor vence (ADR-026); o usuário descarta e o pull restaura.
            for (const p of batch) if (p.id !== undefined) await this.db.targetSyncQueue.update(p.id, this.failure(p, error))
          }
          continue
        }
        try {
          const table = tables[item.entity]
          if (item.operation === 'delete') {
            await deleteRows(table, { id: item.entityId })
          } else if (item.entity === 'organizations') {
            const organization = item.payload as Organization
            const [existing] = await selectRows(table, { id: item.entityId })
            if (existing) {
              await updateRows(table, { id: item.entityId }, { name: organization.name, updated_at: organization.updatedAt })
            } else {
              await rpc('create_organization', { p_id: item.entityId, p_name: organization.name })
            }
          } else {
            await upsertRows(table, [toRemoteRow(item.entity, item.payload!)])
          }
          if (item.id !== undefined) await this.db.targetSyncQueue.delete(item.id)
        } catch (error) {
          if (item.id === undefined) continue
          // Unicidade violada por outro aparelho (mesma função no serviço / mesmo dia): o servidor vence.
          // Descarta o item e o registro local órfão; o próximo pull traz o equivalente.
          if (error instanceof ApiError && error.status === 409 && item.operation === 'upsert' && UNIQUE_BY_CONTENT.includes(item.entity)) {
            await this.db.targetSyncQueue.delete(item.id)
            await localTable(this.db, item.entity).delete(item.entityId)
            continue
          }
          await this.db.targetSyncQueue.update(item.id, this.failure(item, error))
        }
      }

      for (const entity of Object.keys(tables) as TargetEntityName[]) {
        const rows = await selectRows(tables[entity]).catch(() => null)
        if (!rows) continue
        const table = localTable(this.db, entity)
        for (const row of rows) {
          const value = fromRemoteRow(entity, row)
          const valueId = entity === 'stageSessionStates'
            ? (value as StageSessionState).stageSessionId
            : (value as Exclude<TargetEntity, StageSessionState>).id
          if (entity === 'services') {
            // `status` é do servidor: sobrescreve sem LWW; demais campos seguem LWW.
            const remote = value as Service
            const local = await this.db.services.get(remote.id)
            await this.db.services.put(local && local.updatedAt > remote.updatedAt ? { ...local, status: remote.status } : remote)
            continue
          }
          if (entity === 'assignments') {
            // Autoridade do servidor (ADR-057): sobrescreve sem LWW.
            await table.put(value as never)
            continue
          }
          if (entity === 'teamMemberships') {
            await this.applyTeamMembership(value as TeamMembership)
            continue
          }
          const local = await table.get(valueId)
          if (local && local.updatedAt > value.updatedAt) continue
          await table.put(value as never)
        }
      }
      notifyRemoteDataApplied()
    } finally {
      this.syncing = false
    }
    // Só o que ainda pode dar certo: itens `failed` esperam o usuário descartar.
    const retryable = await this.db.targetSyncQueue.filter((i) => i.status !== 'failed').toArray()
    if (retryable.length > 0 && this.retryTimer === undefined && navigator.onLine) {
      // Recuo exponencial pelo maior `attempts` da fila (10 s, 20 s… no máximo 300 s).
      const attempts = Math.max(...retryable.map((i) => i.attempts))
      this.retryTimer = window.setTimeout(() => {
        this.retryTimer = undefined
        void this.sync()
      }, Math.min(10000 * 2 ** Math.min(attempts, 5), 300000))
    }
  }
}
