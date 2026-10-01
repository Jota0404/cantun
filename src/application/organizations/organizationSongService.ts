import type { OrganizationSong } from '../../domain/organizations/organizationSong'
import { organizationSongRepository } from '../../db/repositories/organizationSongRepository'

export async function addSongToOrganization(organizationId: string, songId: string, id = crypto.randomUUID()): Promise<OrganizationSong> {
  const existing = await organizationSongRepository.findByOrganizationAndSong(organizationId, songId)
  if (existing) return existing
  const now = new Date().toISOString()
  const value: OrganizationSong = { id, organizationId, songId, createdAt: now, updatedAt: now }
  await organizationSongRepository.create(value)
  return value
}
