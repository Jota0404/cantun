import Dexie, { type Table } from 'dexie'
import type { Setlist } from '../domain/repertoires/setlist'
import type { SetlistSong } from '../domain/repertoires/setlistSong'
import type { Song } from '../domain/songs/song'
import type { Band } from '../domain/bands/band'
import type { BandMember } from '../domain/bands/bandMember'
import type { BandSong } from '../domain/bands/bandSong'
import type { BandSongMemberState } from '../domain/bands/bandSongMemberState'
import type { BandSetlist } from '../domain/bands/bandSetlist'
import type { BandSetlistSong } from '../domain/bands/bandSetlistSong'
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
import type { BandSyncQueueItem } from '../sync/bandSyncEngine'
import type { TargetSyncQueueItem } from '../sync/targetSyncEngine'

export class SalmodiaDatabase extends Dexie {
  songs!: Table<Song, string>
  setlists!: Table<Setlist, string>
  setlistSongs!: Table<SetlistSong, string>
  syncQueue!: Table<SyncQueueItem, number>
  bands!: Table<Band, string>
  bandMembers!: Table<BandMember, string>
  bandSongs!: Table<BandSong, string>
  bandSongMemberStates!: Table<BandSongMemberState, string>
  bandSetlists!: Table<BandSetlist, string>
  bandSetlistSongs!: Table<BandSetlistSong, string>
  bandSyncQueue!: Table<BandSyncQueueItem, number>
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
      await transaction.table<SetlistSong, string>('setlistSongs').toCollection().modify((entry) => {
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


  }
}

export const db = new SalmodiaDatabase()
