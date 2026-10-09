import type { Organization } from '../../domain/organizations/organization'
import { rpc } from '../../platform/rpc'
import { db } from '../../db/database'
import { organizationRepository } from '../../db/repositories/organizationRepository'

export async function createOrganization(name: string, id = crypto.randomUUID()): Promise<Organization> {
  const now = new Date().toISOString()
  const data = await rpc<Record<string, unknown> | Record<string, unknown>[] | null>('create_organization', { p_id: id, p_name: name.trim() })
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('Organização não foi criada.')
  const organization: Organization = { id: String(row.id), name: String(row.name), createdAt: String(row.created_at ?? now), updatedAt: String(row.updated_at ?? now) }
  await db.transaction('rw', db.organizations, db.organizationMemberships, async () => {
    await organizationRepository.create(organization)
  })
  return organization
}
