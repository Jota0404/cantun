import type { Table } from 'dexie'
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
import type { ServicePreparation } from '../domain/services/servicePreparation'
import type { StageSession } from '../domain/stage/stageSession'
import type { Rehearsal, RehearsalSong } from '../domain/services/rehearsal'
import type { Material } from '../domain/services/material'
import { rehearsalSongId } from '../domain/services/rehearsal'
import { preparationId } from '../domain/services/servicePreparation'
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
  | 'servicePreparations'
  | 'rehearsals'
  | 'rehearsalSongs'
  | 'materials'
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
  | ServicePreparation
  | Rehearsal
  | RehearsalSong
  | Material
  | StageSession
  | StageSessionState

// Sessão e estado do Palco só mudam por RPC (`create_target_stage_session`, `target_stage_*`);
// o `cantum_user` só tem SELECT nessas tabelas, então elas são só pull. O mesmo vale para `organization_memberships`
// (papel e remoção por `update_organization_member_role`/`remove_organization_member`, issue #99).
// Têm `unique` por conteúdo no banco, com id gerado no cliente: 409 no push = outro aparelho criou o mesmo.
const UNIQUE_BY_CONTENT: readonly TargetEntityName[] = ['servicePositions', 'memberAvailability']

// `organization_songs` saiu na 0007 (ADR-062): a música do Ministério é uma cópia em `songs`.
const REMOVED_ENTITIES = ['organizationSongs'] as const

const READ_ONLY_ENTITIES = ['stageSessions', 'stageSessionStates', 'assignments', 'organizationMemberships'] as const

export type TargetWritableEntityName = Exclude<TargetEntityName, typeof READ_ONLY_ENTITIES[number]>

export type TargetWritableEntity =
  | Organization
  | Team
  | TeamMembership
  | Repertoire
  | RepertoireItem
  | Service
  | ServiceItem
  | ServicePosition
  | MemberAvailability
  | ServicePreparation
  | Rehearsal
  | RehearsalSong
  | Material

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

// Listas puxadas inteiras (escopo do usuário): o pull também remove o que sumiu do servidor. Services e repertoires
// também recebem `putLocal` (já confirmado pelo servidor); a proteção é a fila vazia e o snapshot local anterior ao GET.
const MIRRORED_ENTITIES = ['services', 'repertoires', 'serviceItems', 'repertoireItems', 'servicePositions', 'memberAvailability'] as const
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
  servicePreparations: 'service_preparations',
  rehearsals: 'rehearsals',
  rehearsalSongs: 'rehearsal_songs',
  materials: 'materials',
  stageSessions: 'stage_sessions',
  stageSessionStates: 'stage_session_states',
}

// `rehearsalSongs` não tem `id`/`updatedAt` (chave composta): a fila usa `rehearsalId:serviceItemId`.
const queueId = (payload: TargetWritableEntity) => 'serviceItemId' in payload ? rehearsalSongId(payload.rehearsalId, payload.serviceItemId) : payload.id
const queueUpdatedAt = (payload: TargetWritableEntity) => 'updatedAt' in payload ? payload.updatedAt : new Date().toISOString()

function toRemoteRow(entity: TargetWritableEntityName, value: TargetWritableEntity) {
  switch (entity) {
    case 'organizations': {
      const v = value as Organization
      return { id: v.id, name: v.name, created_at: v.createdAt, updated_at: v.updatedAt }
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
      return { id: v.id, service_id: v.serviceId, type: v.type, song_id: v.songId ?? null, title: v.title ?? null, notes: v.notes ?? null, duration_minutes: v.durationMinutes ?? null, position: v.position, repertoire_id: v.repertoireId ?? null, key: v.key ?? null, ref_item_id: v.refItemId ?? null, updated_at: v.updatedAt }
    }
    case 'servicePositions': {
      const v = value as ServicePosition
      return { id: v.id, service_id: v.serviceId, musical_function: v.musicalFunction, quantity: v.quantity, notes: v.notes ?? null, created_at: v.createdAt, updated_at: v.updatedAt }
    }
    case 'servicePreparations': {
      const v = value as ServicePreparation
      return { service_id: v.serviceId, user_id: v.userId, prepared_at: v.preparedAt, updated_at: v.updatedAt }
    }
    case 'rehearsals': {
      const v = value as Rehearsal
      return { id: v.id, organization_id: v.organizationId, service_id: v.serviceId, starts_at: v.startsAt, location: v.location ?? null, notes: v.notes ?? null, created_at: v.createdAt, updated_at: v.updatedAt }
    }
    case 'rehearsalSongs': {
      const v = value as RehearsalSong
      return { rehearsal_id: v.rehearsalId, service_item_id: v.serviceItemId }
    }
    case 'materials': {
      const v = value as Material
      return { id: v.id, organization_id: v.organizationId, service_id: v.serviceId ?? null, rehearsal_id: v.rehearsalId ?? null, song_id: v.songId ?? null, kind: v.kind, title: v.title, url: v.url, notes: v.notes ?? null, created_by: v.createdByUserId ?? null, created_at: v.createdAt, updated_at: v.updatedAt }
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
    case 'serviceItems': return { id: String(row.id), serviceId: String(row.service_id), type: (row.type ?? 'song') as ServiceItem['type'], songId: row.song_id ? String(row.song_id) : undefined, title: row.title ? String(row.title) : undefined, notes: row.notes ? String(row.notes) : undefined, durationMinutes: row.duration_minutes == null ? undefined : Number(row.duration_minutes), position: Number(row.position), repertoireId: row.repertoire_id ? String(row.repertoire_id) : undefined, key: row.key ? String(row.key) as ServiceItem['key'] : undefined, refItemId: row.ref_item_id ? String(row.ref_item_id) : undefined, updatedAt: String(row.updated_at) }
    case 'assignments': return toAssignment(row)
    case 'servicePositions': return { id: String(row.id), serviceId: String(row.service_id), musicalFunction: String(row.musical_function), quantity: Number(row.quantity), notes: row.notes ? String(row.notes) : undefined, createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
    case 'memberAvailability': return { id: String(row.id), userId: String(row.user_id), organizationId: String(row.organization_id), date: String(row.date).slice(0, 10), status: row.status as MemberAvailability['status'], note: row.note ? String(row.note) : undefined, createdAt: String(row.created_at ?? row.updated_at), updatedAt: String(row.updated_at) }
    case 'servicePreparations': return { id: preparationId(String(row.service_id), String(row.user_id)), serviceId: String(row.service_id), userId: String(row.user_id), preparedAt: String(row.prepared_at), updatedAt: String(row.updated_at ?? row.prepared_at) }
    case 'rehearsals': return { id: String(row.id), organizationId: String(row.organization_id), serviceId: String(row.service_id), startsAt: String(row.starts_at), location: row.location ? String(row.location) : undefined, notes: row.notes ? String(row.notes) : undefined, createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
    case 'rehearsalSongs': return { rehearsalId: String(row.rehearsal_id), serviceItemId: String(row.service_item_id) }
    case 'materials': return { id: String(row.id), organizationId: String(row.organization_id), serviceId: row.service_id ? String(row.service_id) : undefined, rehearsalId: row.rehearsal_id ? String(row.rehearsal_id) : undefined, songId: row.song_id ? String(row.song_id) : undefined, kind: 'link', title: String(row.title), url: String(row.url), notes: row.notes ? String(row.notes) : undefined, createdByUserId: row.created_by ? String(row.created_by) : undefined, createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
    case 'stageSessions': return { id: String(row.id), serviceId: String(row.service_id), mdUserId: row.md_user_id ? String(row.md_user_id) : undefined, status: row.status as StageSession['status'], createdAt: String(row.created_at), startedAt: row.started_at ? String(row.started_at) : undefined, endedAt: row.ended_at ? String(row.ended_at) : undefined, updatedAt: String(row.updated_at) }
    case 'stageSessionStates': return toStageSessionState(row)
  }
}

// `rehearsalSongs` tem chave composta e sem `updatedAt`; os usos genéricos abaixo só olham `id`/`updatedAt`.
function localTable(db: SalmodiaDatabase, entity: TargetEntityName): Table<{ updatedAt: string }, string> {
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
    servicePreparations: db.servicePreparations,
    rehearsals: db.rehearsals,
    rehearsalSongs: db.rehearsalSongs,
    materials: db.materials,
    stageSessions: db.stageSessions,
    stageSessionStates: db.stageSessionStates,
  }
  return map[entity] as unknown as Table<{ updatedAt: string }, string>
}

export type QueueExtra = { deleteSongIds?: string[]; upsertSongs?: RehearsalSong[] }

export class TargetSyncEngine {
  private syncing = false
  private stopped = false
  private retryTimer: number | undefined
  private readonly db: SalmodiaDatabase
  constructor(db: SalmodiaDatabase) {
    this.db = db
  }

  async queueUpsert(entity: TargetWritableEntityName, payload: TargetWritableEntity): Promise<void> {
    await this.db.targetSyncQueue.where('[entity+entityId]').equals([entity, queueId(payload)]).delete()
    await this.db.targetSyncQueue.add({ entity, entityId: queueId(payload), operation: 'upsert', payload, updatedAt: queueUpdatedAt(payload), attempts: 0 })
    void this.sync()
  }

  /**
   * Grava `write` e enfileira todos os `payloads` numa única transação; o sync só roda depois do commit,
   * então nunca enxerga um lote parcial (unique de posição deferida no banco).
   */
  async queueUpserts(entity: TargetWritableEntityName, payloads: TargetWritableEntity[], tables: Table[], write: () => Promise<void>, also: QueueExtra = {}): Promise<void> {
    await this.db.transaction('rw', [this.db.targetSyncQueue, ...tables], async () => {
      await write()
      for (const payload of payloads) {
        await this.db.targetSyncQueue.where('[entity+entityId]').equals([entity, queueId(payload)]).delete()
        await this.db.targetSyncQueue.add({ entity, entityId: queueId(payload), operation: 'upsert', payload, updatedAt: queueUpdatedAt(payload), attempts: 0 })
      }
      for (const entityId of also.deleteSongIds ?? []) await this.db.targetSyncQueue.where('[entity+entityId]').equals(['rehearsalSongs', entityId]).delete()
      for (const entityId of also.deleteSongIds ?? []) await this.db.targetSyncQueue.add({ entity: 'rehearsalSongs', entityId, operation: 'delete', updatedAt: new Date().toISOString(), attempts: 0 })
      for (const song of also.upsertSongs ?? []) {
        await this.db.targetSyncQueue.where('[entity+entityId]').equals(['rehearsalSongs', queueId(song)]).delete()
        await this.db.targetSyncQueue.add({ entity: 'rehearsalSongs', entityId: queueId(song), operation: 'upsert', payload: song, updatedAt: queueUpdatedAt(song), attempts: 0 })
      }
    })
    void this.sync()
  }

  private failure(item: TargetSyncQueueItem, error: unknown): Partial<TargetSyncQueueItem> {
    const attempts = item.attempts + 1
    return isPermanent(error) ? { attempts, status: 'failed', lastError: error.message } : { attempts }
  }

  /** `true` quando a entidade não tem mais alteração na fila: o servidor aceitou o que o aparelho enviou. */
  /** Apaga e enfileira o delete numa transação (o pull não enxerga o meio-termo). */
  async queueDeleteAtomic(entity: TargetWritableEntityName, entityIds: string | string[], tables: Table[], write: () => Promise<void>): Promise<void> {
    await this.db.transaction('rw', [this.db.targetSyncQueue, ...tables], async () => {
      await write()
      // Vários ids: a fila respeita a ordem recebida (dependentes antes do alvo).
      for (const entityId of [entityIds].flat()) {
        await this.db.targetSyncQueue.where('[entity+entityId]').equals([entity, entityId]).delete()
        // Ensaio criado e excluído offline: as músicas pendentes não podem subir (o ensaio nunca existiu no servidor).
        if (entity === 'rehearsals') await this.db.targetSyncQueue.filter((i) => i.entity === 'rehearsalSongs' && i.entityId.startsWith(`${entityId}:`)).delete()
        await this.db.targetSyncQueue.add({ entity, entityId, operation: 'delete', updatedAt: new Date().toISOString(), attempts: 0 })
      }
    })
    void this.sync()
  }

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
      if (item.operation === 'upsert') await this.deleteLocal(item.entity, item.entityId)
      if (item.id !== undefined) await this.db.targetSyncQueue.delete(item.id)
    }
    void this.sync()
  }

  private async deleteLocal(entity: TargetEntityName, entityId: string): Promise<void> {
    if (entity === 'rehearsalSongs') {
      const [rehearsalId, serviceItemId] = entityId.split(':')
      await this.db.rehearsalSongs.delete([rehearsalId, serviceItemId])
      return
    }
    await localTable(this.db, entity).delete(entityId)
    if (entity === 'rehearsals') {
      // Sem o ensaio, o foco local e o pendente na fila falhariam (ensaio inexistente).
      await this.db.rehearsalSongs.where('rehearsalId').equals(entityId).delete()
      await this.db.targetSyncQueue.filter((i) => i.entity === 'rehearsalSongs' && i.entityId.startsWith(`${entityId}:`)).delete()
    }
  }

  /** Filhos de serviço apagado no servidor (ON DELETE CASCADE): somem aqui também, com o que estava na fila deles (o pai não existe mais). */
  private async cascadeService(serviceIds: string[]): Promise<void> {
    const ids = async (table: Table<unknown, string>, index: string, owners: string[]) => (await table.where(index).anyOf(owners).primaryKeys()) as string[]
    const rehearsalIds = await ids(this.db.rehearsals, 'serviceId', serviceIds)
    const sessionIds = await ids(this.db.stageSessions, 'serviceId', serviceIds)
    const byEntity: Array<[TargetEntityName, string[]]> = [
      ['serviceItems', await ids(this.db.serviceItems, 'serviceId', serviceIds)],
      ['servicePositions', await ids(this.db.servicePositions, 'serviceId', serviceIds)],
      ['assignments', await ids(this.db.assignments, 'serviceId', serviceIds)],
      ['servicePreparations', await ids(this.db.servicePreparations, 'serviceId', serviceIds)],
      ['rehearsals', rehearsalIds],
      ['materials', [...await ids(this.db.materials, 'serviceId', serviceIds), ...await ids(this.db.materials, 'rehearsalId', rehearsalIds)]],
      ['stageSessions', sessionIds],
      ['stageSessionStates', sessionIds],
    ]
    for (const [entity, entityIds] of byEntity) {
      if (!entityIds.length) continue
      await (localTable(this.db, entity) as Table<unknown, string>).bulkDelete(entityIds)
      await this.db.targetSyncQueue.filter((i) => i.entity === entity && entityIds.includes(i.entityId)).delete()
    }
    await this.db.rehearsalSongs.where('rehearsalId').anyOf(rehearsalIds).delete()
    await this.db.targetSyncQueue.filter((i) => i.entity === 'rehearsalSongs' && rehearsalIds.some((r) => i.entityId.startsWith(`${r}:`))).delete()
  }

  private async cascadeRepertoire(repertoireIds: string[]): Promise<void> {
    const itemIds = (await this.db.repertoireItems.where('repertoireId').anyOf(repertoireIds).primaryKeys()) as string[]
    await this.db.repertoireItems.bulkDelete(itemIds)
    await this.db.targetSyncQueue.filter((i) => i.entity === 'repertoireItems' && itemIds.includes(i.entityId)).delete()
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

  /** Para o retry e espera o sync em andamento terminar; nada reagenda até `start()`. */
  async stop(): Promise<void> {
    this.stopped = true
    window.clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    while (this.syncing) await new Promise((resolve) => setTimeout(resolve, 10))
  }

  start(): void {
    this.stopped = false
  }

  async sync(): Promise<void> {
    if (this.syncing || this.stopped || !navigator.onLine) return
    this.syncing = true
    try {
      // Itens de entidades só-leitura enfileirados por versões antigas nunca seriam aceitos.
      await this.db.targetSyncQueue.where('entity').anyOf([...READ_ONLY_ENTITIES, ...REMOVED_ENTITIES]).delete()
      const pending = (await this.db.targetSyncQueue.orderBy('id').toArray()).filter((p) => p.status !== 'failed')
      const done = new Set<number | undefined>()
      for (const item of pending) {
        if (this.stopped) return
        if (done.has(item.id)) continue
        // Itens do mesmo serviço (ou repertório) sobem num só lote (uma transação no servidor; unique de posição deferida).
        if ((BATCHED_ENTITIES as readonly string[]).includes(item.entity) && item.operation === 'upsert') {
          const key = batchKey(item)
          const all = pending.filter((p) => !done.has(p.id) && p.entity === item.entity && p.operation === 'upsert' && batchKey(p) === key)
          for (const p of all) done.add(p.id)
          const refs = (p: TargetSyncQueueItem) => (p.payload && 'refItemId' in p.payload && p.payload.refItemId ? 1 : 0)
          // RN-10/11: reprise cujo alvo sumiu (apagado em outro aparelho; o pull não apaga) seria recusada e envenenaria o lote.
          const inBatch = new Set(all.map((p) => p.entityId))
          const batch: TargetSyncQueueItem[] = []
          for (const p of all) {
            const ref = p.payload && 'refItemId' in p.payload ? p.payload.refItemId : undefined
            if (ref && !inBatch.has(ref) && !(await this.db.serviceItems.get(ref))) {
              await this.db.serviceItems.delete(p.entityId)
              if (p.id !== undefined) await this.db.targetSyncQueue.delete(p.id)
            } else batch.push(p)
          }
          if (batch.length === 0) continue
          // Reprise/medley só depois do item que referenciam (a FK é checada por linha); sort estável.
          const rows = [...batch].sort((a, b) => refs(a) - refs(b)).map((p) => toRemoteRow(item.entity, p.payload!))
          try {
            await upsertRows(tables[item.entity], rows)
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
            const [serviceId, userId] = item.entityId.split(':')
            await deleteRows(table, item.entity === 'servicePreparations' ? { service_id: serviceId, user_id: userId }
              : item.entity === 'rehearsalSongs' ? { rehearsal_id: serviceId, service_item_id: userId } : { id: item.entityId })
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
            await this.deleteLocal(item.entity, item.entityId)
            continue
          }
          await this.db.targetSyncQueue.update(item.id, this.failure(item, error))
        }
      }

      for (const entity of Object.keys(tables) as TargetEntityName[]) {
        if (this.stopped) return
        const table = localTable(this.db, entity)
        const mirrored = (MIRRORED_ENTITIES as readonly string[]).includes(entity)
        // Ids locais ANTES do GET: só eles podem ser espelhados para fora (o que nasce durante o GET não depende de relógios).
        const localIdsBeforePull = mirrored ? new Set((await table.toArray() as unknown as { id: string }[]).map((l) => l.id)) : null
        // Pull completo = GET sem filtro respondeu (o servidor devolve o escopo inteiro: invariante em platform/sync.ts).
        // Erro/offline => null => nada é espelhado nem varrido para esta entidade. Não há sinal extra do servidor.
        const rows = await selectRows(tables[entity]).catch(() => null)
        if (this.stopped) return // signOut/exclusão em andamento: nada grava no Dexie depois de stop().
        if (rows === null) continue
        // Delete pendente nesta fila: o pull não pode devolver a linha ao Dexie antes de o servidor apagar.
        // `failed` (recusado pelo servidor) não conta: o servidor vence e o pull restaura a linha (ADR-026).
        const entityQueue = await this.db.targetSyncQueue.where('entity').equals(entity).toArray()
        const pendingDeletes = new Set(entityQueue.filter((i) => i.operation === 'delete' && i.status !== 'failed').map((i) => i.entityId))
        if (localIdsBeforePull) {
          // Espelho do servidor (pull completo, sem filtro: o que o RLS devolve é o escopo do usuário): linha local que sumiu
          // do servidor foi apagada em outro aparelho. Só com a fila da entidade vazia e só linhas que já existiam antes do GET
          // (uma criada durante o pull ainda não foi enfileirada). Pull com erro/offline não chega aqui.
          const remoteIds = new Set(rows.map((r) => String((r as { id?: unknown }).id)))
          if (entityQueue.every((i) => i.operation === 'delete' && i.status === 'failed')) {
            const stale = [...localIdsBeforePull].filter((id) => !remoteIds.has(id))
            if (stale.length) {
              if (entity === 'services') await this.cascadeService(stale)
              if (entity === 'repertoires') await this.cascadeRepertoire(stale)
              if (entity === 'serviceItems') {
                await this.db.rehearsalSongs.where('serviceItemId').anyOf(stale).delete()
                await this.db.targetSyncQueue.filter((i) => i.entity === 'rehearsalSongs' && stale.some((x) => i.entityId.endsWith(`:${x}`))).delete()
              }
              await table.bulkDelete(stale)
            }
          }
        }
        if (entity === 'servicePreparations') {
          // Desmarcado em outro aparelho: a linha sumiu do servidor (o pull não apaga); só preserva o que ainda está na fila.
          const remoteIds = new Set(rows.map((r) => preparationId(String(r.service_id), String(r.user_id))))
          for (const local of await this.db.servicePreparations.toArray()) {
            if (!remoteIds.has(local.id) && await this.isSent('servicePreparations', local.id)) await this.db.servicePreparations.delete(local.id)
          }
        }
        if (entity === 'materials') {
          // Apagado em outro aparelho: o pull não apaga; só preserva o que ainda está na fila.
          const remoteIds = new Set(rows.map((r) => String(r.id)))
          for (const local of await this.db.materials.toArray()) {
            if (!remoteIds.has(local.id) && await this.isSent('materials', local.id)) await this.db.materials.delete(local.id)
          }
        }
        if (entity === 'rehearsals' || entity === 'rehearsalSongs') {
          // Apagado em outro aparelho: o pull não apaga; só preserva o que ainda está na fila.
          const remoteIds = new Set(rows.map((r) => entity === 'rehearsals' ? String(r.id) : rehearsalSongId(String(r.rehearsal_id), String(r.service_item_id))))
          const locals: { id: string; rowId: string | [string, string] }[] = entity === 'rehearsals'
            ? (await this.db.rehearsals.toArray()).map((l) => ({ id: l.id, rowId: l.id }))
            : (await this.db.rehearsalSongs.toArray()).map((l) => ({ id: rehearsalSongId(l.rehearsalId, l.serviceItemId), rowId: [l.rehearsalId, l.serviceItemId] }))
          for (const local of locals) {
            if (!remoteIds.has(local.id) && await this.isSent(entity, local.id)) await (table as unknown as Table<unknown, string | [string, string]>).delete(local.rowId)
          }
        }
        for (const row of rows) {
          if (this.stopped) return
          const value = fromRemoteRow(entity, row)
          if (entity === 'rehearsalSongs') {
            const song = value as RehearsalSong
            if (await this.isSent('rehearsalSongs', rehearsalSongId(song.rehearsalId, song.serviceItemId))) await this.db.rehearsalSongs.put(song)
            continue
          }
          const valueId = entity === 'stageSessionStates'
            ? (value as StageSessionState).stageSessionId
            : (value as Exclude<TargetEntity, StageSessionState | RehearsalSong>).id
          if (pendingDeletes.has(valueId)) continue
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
          if (local && local.updatedAt > (value as { updatedAt: string }).updatedAt) continue
          await table.put(value as never)
        }
      }
      notifyRemoteDataApplied()
    } finally {
      this.syncing = false
    }
    // Só o que ainda pode dar certo: itens `failed` esperam o usuário descartar.
    const retryable = await this.db.targetSyncQueue.filter((i) => i.status !== 'failed').toArray()
    if (retryable.length > 0 && !this.stopped && this.retryTimer === undefined && navigator.onLine) {
      // Recuo exponencial pelo maior `attempts` da fila (10 s, 20 s… no máximo 300 s).
      const attempts = Math.max(...retryable.map((i) => i.attempts))
      this.retryTimer = window.setTimeout(() => {
        this.retryTimer = undefined
        void this.sync()
      }, Math.min(10000 * 2 ** Math.min(attempts, 5), 300000))
    }
  }
}
