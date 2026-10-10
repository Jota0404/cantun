import Dexie, { type Table } from 'dexie'
import type { Song } from '../domain/songs/song'
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
import type { StageSession } from '../domain/stage/stageSession'
import type { StageSessionState } from '../domain/stage/stageSessionState'
import type { SyncQueueItem } from '../sync/syncEngine'
import type { TargetSyncQueueItem } from '../sync/targetSyncEngine'

export class SalmodiaDatabase extends Dexie {
  songs!: Table<Song, string>
  syncQueue!: Table<SyncQueueItem, number>
  organizations!: Table<Organization, string>
  organizationMemberships!: Table<OrganizationMembership, string>
  teams!: Table<Team, string>
  teamMemberships!: Table<TeamMembership, string>
  organizationSongs!: Table<OrganizationSong, string>
  repertoires!: Table<Repertoire, string>
  repertoireItems!: Table<RepertoireItem, string>
  services!: Table<Service, string>
  serviceItems!: Table<ServiceItem, string>
  assignments!: Table<Assignment, string>
  stageSessions!: Table<StageSession, string>
  stageSessionStates!: Table<StageSessionState, string>
  targetSyncQueue!: Table<TargetSyncQueueItem, number>

  constructor() {
    super('SalmodiaDatabase')

    this.version(1).stores({ songs: 'id' })
    this.version(2).stores({
      songs: 'id', setlists: 'id, name, updatedAt',
      setlistSongs: 'id, setlistId, songId, position, [setlistId+position], [setlistId+songId]',
    })
    this.version(3).stores({
      songs: 'id, updatedAt', setlists: 'id, name, updatedAt',
      setlistSongs: 'id, setlistId, songId, position, [setlistId+position], [setlistId+songId]',
      syncQueue: '++id, userId, entity, entityId, updatedAt, [userId+entity], [userId+entity+entityId]',
    })
    this.version(4).stores({
      songs: 'id, updatedAt', setlists: 'id, name, updatedAt',
      setlistSongs: 'id, setlistId, songId, position, updatedAt, [setlistId+position], [setlistId+songId]',
      syncQueue: '++id, userId, entity, entityId, updatedAt, [userId+entity], [userId+entity+entityId]',
    }).upgrade(async (transaction) => {
      const now = new Date().toISOString()
      await transaction.table<{ updatedAt?: string }, string>('setlistSongs').toCollection().modify((entry) => {
        if (!entry.updatedAt) entry.updatedAt = now
      })
    })
    this.version(5).stores({
      songs: 'id, updatedAt', setlists: 'id, name, updatedAt',
      setlistSongs: 'id, setlistId, songId, position, updatedAt, [setlistId+position], [setlistId+songId]',
      syncQueue: '++id, userId, entity, entityId, updatedAt, [userId+entity], [userId+entity+entityId]',
      bands: 'id, ownerUserId, updatedAt', bandMembers: 'id, bandId, userId, [bandId+userId], updatedAt',
      bandSongs: 'id, bandId, sourceSongId, [bandId+sourceSongId], updatedAt',
      bandSongMemberStates: 'id, bandSongId, userId, [bandSongId+userId], updatedAt',
      bandSetlists: 'id, bandId, createdByUserId, updatedAt',
      bandSetlistSongs: 'id, bandSetlistId, bandSongId, position, [bandSetlistId+bandSongId], [bandSetlistId+position], updatedAt',
    })
    this.version(6).stores({
      songs: 'id, updatedAt', setlists: 'id, name, updatedAt',
      setlistSongs: 'id, setlistId, songId, position, updatedAt, [setlistId+position], [setlistId+songId]',
      syncQueue: '++id, userId, entity, entityId, updatedAt, [userId+entity], [userId+entity+entityId]',
      bands: 'id, ownerUserId, updatedAt', bandMembers: 'id, bandId, userId, [bandId+userId], updatedAt',
      bandSongs: 'id, bandId, sourceSongId, [bandId+sourceSongId], updatedAt',
      bandSongMemberStates: 'id, bandSongId, userId, [bandSongId+userId], updatedAt',
      bandSetlists: 'id, bandId, createdByUserId, updatedAt',
      bandSetlistSongs: 'id, bandSetlistId, bandSongId, position, [bandSetlistId+bandSongId], [bandSetlistId+position], updatedAt',
      bandSyncQueue: '++id, userId, entity, entityId, updatedAt, [userId+entity], [userId+entity+entityId]',
    })
    this.version(7).stores({
      songs: 'id, updatedAt', setlists: 'id, name, updatedAt',
      setlistSongs: 'id, setlistId, songId, position, updatedAt, [setlistId+position], [setlistId+songId]',
      syncQueue: '++id, userId, entity, entityId, updatedAt, [userId+entity], [userId+entity+entityId]',
      bands: 'id, ownerUserId, updatedAt', bandMembers: 'id, bandId, userId, [bandId+userId], updatedAt',
      bandSongs: 'id, bandId, sourceSongId, [bandId+sourceSongId], updatedAt',
      bandSongMemberStates: 'id, bandSongId, userId, [bandSongId+userId], updatedAt',
      bandSetlists: 'id, bandId, createdByUserId, updatedAt',
      bandSetlistSongs: 'id, bandSetlistId, bandSongId, position, [bandSetlistId+bandSongId], [bandSetlistId+position], updatedAt',
      bandSyncQueue: '++id, userId, entity, entityId, updatedAt, [userId+entity], [userId+entity+entityId]',
      organizations: 'id, updatedAt',
      organizationMemberships: 'id, organizationId, userId, [organizationId+userId], updatedAt',
      teams: 'id, organizationId, updatedAt',
      teamMemberships: 'id, teamId, userId, [teamId+userId], updatedAt',
      organizationSongs: 'id, organizationId, songId, [organizationId+songId], updatedAt',
      repertoires: 'id, organizationId, updatedAt',
      repertoireItems: 'id, repertoireId, songId, position, updatedAt, [repertoireId+position], [repertoireId+songId]',
    })
    this.version(8).stores({
      songs: 'id, updatedAt', setlists: 'id, name, updatedAt',
      setlistSongs: 'id, setlistId, songId, position, updatedAt, [setlistId+position], [setlistId+songId]',
      syncQueue: '++id, userId, entity, entityId, updatedAt, [userId+entity], [userId+entity+entityId]',
      bands: 'id, ownerUserId, updatedAt', bandMembers: 'id, bandId, userId, [bandId+userId], updatedAt',
      bandSongs: 'id, bandId, sourceSongId, [bandId+sourceSongId], updatedAt',
      bandSongMemberStates: 'id, bandSongId, userId, [bandSongId+userId], updatedAt',
      bandSetlists: 'id, bandId, createdByUserId, updatedAt',
      bandSetlistSongs: 'id, bandSetlistId, bandSongId, position, updatedAt, [bandSetlistId+position], [bandSetlistId+bandSongId]',
      bandSyncQueue: '++id, userId, entity, entityId, updatedAt, [userId+entity], [userId+entity+entityId]',
      organizations: 'id, updatedAt',
      organizationMemberships: 'id, organizationId, userId, [organizationId+userId], updatedAt',
      teams: 'id, organizationId, updatedAt',
      teamMemberships: 'id, teamId, userId, [teamId+userId], updatedAt',
      organizationSongs: 'id, organizationId, songId, [organizationId+songId], updatedAt',
      repertoires: 'id, organizationId, updatedAt',
      repertoireItems: 'id, repertoireId, songId, position, updatedAt, [repertoireId+position], [repertoireId+songId]',
      services: 'id, organizationId, startsAt, status, updatedAt',
      serviceItems: 'id, serviceId, songId, position, updatedAt, [serviceId+position]',
      assignments: 'id, serviceId, userId, musicalFunction, status, updatedAt, [serviceId+userId]',
    })
    this.version(9).stores({
      songs: 'id, updatedAt', setlists: 'id, name, updatedAt',
      setlistSongs: 'id, setlistId, songId, position, updatedAt, [setlistId+position], [setlistId+songId]',
      syncQueue: '++id, userId, entity, entityId, updatedAt, [userId+entity], [userId+entity+entityId]',
      bands: 'id, ownerUserId, updatedAt', bandMembers: 'id, bandId, userId, [bandId+userId], updatedAt',
      bandSongs: 'id, bandId, sourceSongId, [bandId+sourceSongId], updatedAt',
      bandSongMemberStates: 'id, bandSongId, userId, [bandSongId+userId], updatedAt',
      bandSetlists: 'id, bandId, createdByUserId, updatedAt',
      bandSetlistSongs: 'id, bandSetlistId, bandSongId, position, [bandSetlistId+bandSongId], [bandSetlistId+position], updatedAt',
      bandSyncQueue: '++id, userId, entity, entityId, updatedAt, [userId+entity], [userId+entity+entityId]',
      organizations: 'id, updatedAt',
      organizationMemberships: 'id, organizationId, userId, [organizationId+userId], updatedAt',
      teams: 'id, organizationId, updatedAt',
      teamMemberships: 'id, teamId, userId, [teamId+userId], updatedAt',
      organizationSongs: 'id, organizationId, songId, [organizationId+songId], updatedAt',
      repertoires: 'id, organizationId, updatedAt',
      repertoireItems: 'id, repertoireId, songId, position, updatedAt, [repertoireId+position], [repertoireId+songId]',
      services: 'id, organizationId, startsAt, status, updatedAt',
      serviceItems: 'id, serviceId, songId, position, updatedAt, [serviceId+position]',
      assignments: 'id, serviceId, userId, musicalFunction, status, updatedAt, [serviceId+userId]',
      targetSyncQueue: '++id, entity, entityId, updatedAt, [entity+entityId]',
    })
    this.version(10).stores({
      songs: 'id, updatedAt', setlists: 'id, name, updatedAt',
      setlistSongs: 'id, setlistId, songId, position, updatedAt, [setlistId+position], [setlistId+songId]',
      syncQueue: '++id, userId, entity, entityId, updatedAt, [userId+entity], [userId+entity+entityId]',
      bands: 'id, ownerUserId, updatedAt', bandMembers: 'id, bandId, userId, [bandId+userId], updatedAt',
      bandSongs: 'id, bandId, sourceSongId, [bandId+sourceSongId], updatedAt',
      bandSongMemberStates: 'id, bandSongId, userId, [bandSongId+userId], updatedAt',
      bandSetlists: 'id, bandId, createdByUserId, updatedAt',
      bandSetlistSongs: 'id, bandSetlistId, bandSongId, position, updatedAt, [bandSetlistId+position], [bandSetlistId+bandSongId]',
      bandSyncQueue: '++id, userId, entity, entityId, updatedAt, [userId+entity], [userId+entity+entityId]',
      organizations: 'id, updatedAt',
      organizationMemberships: 'id, organizationId, userId, [organizationId+userId], updatedAt',
      teams: 'id, organizationId, updatedAt',
      teamMemberships: 'id, teamId, userId, [teamId+userId], updatedAt',
      organizationSongs: 'id, organizationId, songId, [organizationId+songId], updatedAt',
      repertoires: 'id, organizationId, updatedAt',
      repertoireItems: 'id, repertoireId, songId, position, updatedAt, [repertoireId+position], [repertoireId+songId]',
      services: 'id, organizationId, startsAt, status, updatedAt',
      serviceItems: 'id, serviceId, songId, position, updatedAt, [serviceId+position]',
      assignments: 'id, serviceId, userId, musicalFunction, status, updatedAt, [serviceId+userId]',
      targetSyncQueue: '++id, entity, entityId, updatedAt, [entity+entityId]',
      stageSessions: 'id, serviceId, status, updatedAt',
      stageSessionStates: 'stageSessionId, revision, currentIndex, currentSongId, updatedAt',
    })
    // ADR-059 §8: o legado Band/Setlist foi removido. As stores saem aqui; as versões 1–10
    // ficam intactas (ADR-011). A fila de `songs` é preservada, a de setlists não faz mais sentido.
    this.version(11).stores({
      setlists: null,
      setlistSongs: null,
      bands: null,
      bandMembers: null,
      bandSongs: null,
      bandSongMemberStates: null,
      bandSetlists: null,
      bandSetlistSongs: null,
      bandSyncQueue: null,
    }).upgrade(async (transaction) => {
      await transaction.table('syncQueue').where('entity').anyOf('setlists', 'setlistSongs').delete()
    })
    // B2 (VS-01): papel e status por equipe. O papel real chega no próximo pull (servidor é a autoridade).
    this.version(12).stores({
      teamMemberships: 'id, teamId, userId, [teamId+userId], updatedAt',
    }).upgrade(async (transaction) => {
      await transaction.table('teamMemberships').toCollection().modify((membership: Record<string, unknown>) => {
        membership.role ??= 'member'
        membership.status ??= 'active'
      })
    })
    // B3 (VS-02, ADR-052): equipe e estados novos do serviço; itens genéricos. O pull corrige `teamId`.
    this.version(13).stores({
      services: 'id, organizationId, teamId, startsAt, status, updatedAt',
    }).upgrade(async (transaction) => {
      const teams = await transaction.table('teams').toArray() as Array<{ id: string; organizationId: string; createdAt: string }>
      const oldestTeam = new Map<string, string>()
      for (const team of [...teams].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
        if (!oldestTeam.has(team.organizationId)) oldestTeam.set(team.organizationId, team.id)
      }
      const statusMap: Record<string, string> = { planned: 'draft', confirmed: 'ready' }
      await transaction.table('services').toCollection().modify((service: Record<string, unknown>) => {
        service.status = statusMap[String(service.status)] ?? service.status
        service.teamId ??= oldestTeam.get(String(service.organizationId)) ?? null
      })
      await transaction.table('serviceItems').toCollection().modify((item: Record<string, unknown>) => {
        item.type ??= 'song'
      })
    })
  }
}

export const db = new SalmodiaDatabase()
