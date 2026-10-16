import type { OrganizationSong } from '../../domain/organizations/organizationSong'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'

/** @deprecated ADR-062: `organization_songs` saiu do servidor. Só leitura local do legado, sem sync; some quando a UI parar de usar. */
export class OrganizationSongRepository {
  private readonly db: SalmodiaDatabase
  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }
  async create(entry: OrganizationSong): Promise<void> { await this.db.organizationSongs.add(entry) }
  async getById(id: string): Promise<OrganizationSong | undefined> { return this.db.organizationSongs.get(id) }
  async listByOrganizationId(organizationId: string): Promise<OrganizationSong[]> { return this.db.organizationSongs.where('organizationId').equals(organizationId).toArray() }
  async listBySongId(songId: string): Promise<OrganizationSong[]> { return this.db.organizationSongs.where('songId').equals(songId).toArray() }
  async findByOrganizationAndSong(organizationId: string, songId: string): Promise<OrganizationSong | undefined> { return this.db.organizationSongs.where('[organizationId+songId]').equals([organizationId, songId]).first() }
  async update(entry: OrganizationSong): Promise<void> { await this.db.organizationSongs.put(entry) }
  async remove(id: string): Promise<void> { await this.db.organizationSongs.delete(id) }
}
export const organizationSongRepository = new OrganizationSongRepository()
