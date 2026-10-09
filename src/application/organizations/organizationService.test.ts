import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../platform/rpc', () => ({ rpc }))
vi.mock('../../platform/http', () => ({ isPlatformConfigured: true }))
vi.mock('../../platform/sync', () => ({ selectRows: vi.fn(async () => []), upsertRows: vi.fn(), updateRows: vi.fn(), deleteRows: vi.fn() }))

import { db } from '../../db/database'
import { createOrganization } from './organizationService'

describe('createOrganization', () => {
  it('saves the organization and queues its sync without a store error', async () => {
    rpc.mockResolvedValueOnce({ id: '00000000-0000-4000-8000-000000000001', name: 'Igreja', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' })

    await expect(createOrganization(' Igreja ', '00000000-0000-4000-8000-000000000001')).resolves.toMatchObject({ id: '00000000-0000-4000-8000-000000000001', name: 'Igreja' })

    expect(await db.organizations.get('00000000-0000-4000-8000-000000000001')).toMatchObject({ name: 'Igreja' })
    expect(rpc).toHaveBeenCalledWith('create_organization', { p_id: '00000000-0000-4000-8000-000000000001', p_name: 'Igreja' })
  })
})
