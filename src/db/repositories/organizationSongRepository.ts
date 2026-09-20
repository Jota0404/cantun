import type { OrganizationSong } from '../../domain/organizations/organizationSong'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'
import { queueTargetDelete, queueTargetUpsert } from '../../sync/syncService'

export class OrganizationSongRepository {
  constructor(private readonly db: SalmodiaDatabase = defaultDb) {}
  async create(entry: OrganizationSong): Promise<void> { await this.db.organizationSongs.add(entry); await queueTargetUpsert('organizationSongs', entry) }
  async getById(id: string): Promise<OrganizationSong | undefined> { return this.db.organizationSongs.get(id) }
  async listByOrganizationId(organizationId: string): Promise<OrganizationSong[]> { return this.db.organizationSongs.where('organizationId').equals(organizationId).toArray() }
  async findByOrganizationAndSong(organizationId: string, songId: string): Promise<OrganizationSong | undefined> { return this.db.organizationSongs.where('[organizationId+songId]').equals([organizationId, songId]).first() }
  async update(entry: OrganizationSong): Promise<void> { await this.db.organizationSongs.put(entry); await queueTargetUpsert('organizationSongs', entry) }
  async remove(id: string): Promise<void> { await this.db.organizationSongs.delete(id); await queueTargetDelete('organizationSongs', id) }
}
export const organizationSongRepository = new OrganizationSongRepository()
