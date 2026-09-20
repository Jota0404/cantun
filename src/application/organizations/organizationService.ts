import { randomUUID } from 'crypto'
import type { Organization } from '../../domain/organizations/organization'
import { supabase } from '../../lib/supabase'
import { db } from '../../db/database'
import { organizationRepository } from '../../db/repositories/organizationRepository'

export async function createOrganization(name: string, id = randomUUID()): Promise<Organization> {
  if (!supabase) throw new Error('Supabase não está configurado.')
  const now = new Date().toISOString()
  const { data, error } = await supabase.rpc('create_organization', { p_id: id, p_name: name.trim() })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('Organização não foi criada.')
  const organization: Organization = { id: String(row.id), name: String(row.name), createdAt: String(row.created_at ?? now), updatedAt: String(row.updated_at ?? now) }
  await db.transaction('rw', db.organizations, db.organizationMemberships, async () => {
    await organizationRepository.create(organization)
  })
  return organization
}
