import type { Organization } from '../domain/organizations/organization'
import type { OrganizationMembership } from '../domain/organizations/organizationMembership'
import type { Team } from '../domain/teams/team'
import type { TeamMembership } from '../domain/teams/teamMembership'
import type { OrganizationSong } from '../domain/organizations/organizationSong'
import type { Repertoire } from '../domain/repertoires/repertoire'
import type { RepertoireItem } from '../domain/repertoires/repertoireItem'
import type { Service } from '../domain/services/service'
import type { ServiceItem } from '../domain/services/serviceItem'
import type { Assignment } from '../domain/services/assignment'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SalmodiaDatabase } from '../db/database'

export type TargetEntityName =
  | 'organizations'
  | 'organizationMemberships'
  | 'teams'
  | 'teamMemberships'
  | 'organizationSongs'
  | 'repertoires'
  | 'repertoireItems'
  | 'services'
  | 'serviceItems'
  | 'assignments'

export type TargetEntity =
  | Organization
  | OrganizationMembership
  | Team
  | TeamMembership
  | OrganizationSong
  | Repertoire
  | RepertoireItem
  | Service
  | ServiceItem
  | Assignment

export interface TargetSyncQueueItem {
  id?: number
  entity: TargetEntityName
  entityId: string
  operation: 'upsert' | 'delete'
  payload?: TargetEntity
  updatedAt: string
  attempts: number
}

const tables: Record<TargetEntityName, string> = {
  organizations: 'organizations',
  organizationMemberships: 'organization_memberships',
  teams: 'teams',
  teamMemberships: 'team_memberships',
  organizationSongs: 'organization_songs',
  repertoires: 'repertoires',
  repertoireItems: 'repertoire_items',
  services: 'services',
  serviceItems: 'service_items',
  assignments: 'assignments',
}

function toRemoteRow(entity: TargetEntityName, value: TargetEntity) {
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
      return { id: v.id, team_id: v.teamId, user_id: v.userId, created_at: v.createdAt, updated_at: v.updatedAt }
    }
    case 'organizationSongs': {
      const v = value as OrganizationSong
      return { id: v.id, organization_id: v.organizationId, song_id: v.songId, created_at: v.createdAt, updated_at: v.updatedAt }
    }
    case 'repertoires': {
      const v = value as Repertoire
      return { id: v.id, organization_id: v.organizationId, name: v.name, created_by_user_id: v.createdByUserId, version: v.version, created_at: v.createdAt, updated_at: v.updatedAt }
    }
    case 'repertoireItems': {
      const v = value as RepertoireItem
      return { id: v.id, repertoire_id: v.repertoireId, song_id: v.songId, position: v.position, updated_at: v.updatedAt }
    }
    case 'services': {
      const v = value as Service
      return { id: v.id, organization_id: v.organizationId, name: v.name, starts_at: v.startsAt, status: v.status, created_by_user_id: v.createdByUserId, created_at: v.createdAt, updated_at: v.updatedAt }
    }
    case 'serviceItems': {
      const v = value as ServiceItem
      return { id: v.id, service_id: v.serviceId, song_id: v.songId, position: v.position, repertoire_id: v.repertoireId ?? null, updated_at: v.updatedAt }
    }
    case 'assignments': {
      const v = value as Assignment
      return { id: v.id, service_id: v.serviceId, user_id: v.userId, musical_function: v.musicalFunction, service_item_id: v.serviceItemId ?? null, status: v.status, created_at: v.createdAt, updated_at: v.updatedAt }
    }
  }
}

function fromRemoteRow(entity: TargetEntityName, row: Record<string, unknown>): TargetEntity {
  switch (entity) {
    case 'organizations': return { id: String(row.id), name: String(row.name), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
    case 'organizationMemberships': return { id: String(row.id), organizationId: String(row.organization_id), userId: String(row.user_id), role: row.role as OrganizationMembership['role'], createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
    case 'teams': return { id: String(row.id), organizationId: String(row.organization_id), name: String(row.name), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
    case 'teamMemberships': return { id: String(row.id), teamId: String(row.team_id), userId: String(row.user_id), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
    case 'organizationSongs': return { id: String(row.id), organizationId: String(row.organization_id), songId: String(row.song_id), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
    case 'repertoires': return { id: String(row.id), organizationId: String(row.organization_id), name: String(row.name), createdByUserId: String(row.created_by_user_id), version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
    case 'repertoireItems': return { id: String(row.id), repertoireId: String(row.repertoire_id), songId: String(row.song_id), position: Number(row.position), updatedAt: String(row.updated_at) }
    case 'services': return { id: String(row.id), organizationId: String(row.organization_id), name: String(row.name), startsAt: String(row.starts_at), status: row.status as Service['status'], createdByUserId: String(row.created_by_user_id), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
    case 'serviceItems': return { id: String(row.id), serviceId: String(row.service_id), songId: String(row.song_id), position: Number(row.position), repertoireId: row.repertoire_id ? String(row.repertoire_id) : undefined, updatedAt: String(row.updated_at) }
    case 'assignments': return { id: String(row.id), serviceId: String(row.service_id), userId: String(row.user_id), musicalFunction: String(row.musical_function), serviceItemId: row.service_item_id ? String(row.service_item_id) : undefined, status: row.status as Assignment['status'], createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
  }
}

function localTable(db: SalmodiaDatabase, entity: TargetEntityName) {
  const map = {
    organizations: db.organizations,
    organizationMemberships: db.organizationMemberships,
    teams: db.teams,
    teamMemberships: db.teamMemberships,
    organizationSongs: db.organizationSongs,
    repertoires: db.repertoires,
    repertoireItems: db.repertoireItems,
    services: db.services,
    serviceItems: db.serviceItems,
    assignments: db.assignments,
  }
  return map[entity]
}

export class TargetSyncEngine {
  private syncing = false
  constructor(private readonly db: SalmodiaDatabase, private readonly client: SupabaseClient) {}

  async queueUpsert(entity: TargetEntityName, payload: TargetEntity): Promise<void> {
    await this.db.targetSyncQueue.where('[entity+entityId]').equals([entity, payload.id]).delete()
    await this.db.targetSyncQueue.add({ entity, entityId: payload.id, operation: 'upsert', payload, updatedAt: payload.updatedAt, attempts: 0 })
    void this.sync()
  }

  async queueDelete(entity: TargetEntityName, entityId: string, updatedAt = new Date().toISOString()): Promise<void> {
    await this.db.targetSyncQueue.where('[entity+entityId]').equals([entity, entityId]).delete()
    await this.db.targetSyncQueue.add({ entity, entityId, operation: 'delete', updatedAt, attempts: 0 })
    void this.sync()
  }

  async createOrganization(value: Organization): Promise<void> {
    const { error } = await this.client.rpc('create_organization', { p_id: value.id, p_name: value.name })
    if (error) throw error
    await this.db.organizations.put(value)
  }

  async sync(): Promise<void> {
    if (this.syncing || !navigator.onLine) return
    this.syncing = true
    try {
      const pending = await this.db.targetSyncQueue.orderBy('id').toArray()
      for (const item of pending) {
        try {
          const table = tables[item.entity]
          if (item.operation === 'delete') {
            const { error } = await this.client.from(table).delete().eq('id', item.entityId)
            if (error) throw error
          } else if (item.entity === 'organizations') {
            const row = toRemoteRow(item.entity, item.payload!)
            const { data: existing, error: readError } = await this.client.from(table).select('id').eq('id', item.entityId).maybeSingle()
            if (readError) throw readError
            if (existing) {
              const { error } = await this.client.from(table).update({ name: row.name, updated_at: row.updated_at }).eq('id', item.entityId)
              if (error) throw error
            } else {
              const { error } = await this.client.rpc('create_organization', { p_id: item.entityId, p_name: row.name })
              if (error) throw error
            }
          } else {
            const { error } = await this.client.from(table).upsert(toRemoteRow(item.entity, item.payload!), { onConflict: 'id' })
            if (error) throw error
          }
          if (item.id !== undefined) await this.db.targetSyncQueue.delete(item.id)
        } catch {
          if (item.id !== undefined) await this.db.targetSyncQueue.update(item.id, { attempts: item.attempts + 1 })
        }
      }

      for (const entity of Object.keys(tables) as TargetEntityName[]) {
        const { data, error } = await this.client.from(tables[entity]).select('*')
        if (error) continue
        const table = localTable(this.db, entity)
        for (const row of (data ?? []) as Record<string, unknown>[]) {
          const value = fromRemoteRow(entity, row)
          const local = await table.get(value.id)
          if (local && local.updatedAt > value.updatedAt) continue
          await table.put(value as never)
        }
      }
    } finally {
      this.syncing = false
    }
  }
}
