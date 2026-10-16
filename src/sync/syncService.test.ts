import { describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ order: [] as string[] }))
vi.mock('../platform/http', () => ({ isPlatformConfigured: true }))
vi.mock('../platform/auth', () => ({ getCurrentUser: () => ({ id: 'u1' }) }))
vi.mock('./targetSyncEngine', () => ({ TargetSyncEngine: class { sync = async () => { m.order.push('target') } } }))
vi.mock('./syncEngine', () => ({ SyncEngine: class { sync = async (id: string) => { m.order.push(`songs:${id}`) } } }))

import { syncTargetDomain } from './syncService'

describe('syncTargetDomain', () => {
  it('pulls the Ministry songs after the Ministries themselves (invite flow)', async () => {
    await syncTargetDomain()
    expect(m.order).toEqual(['target', 'songs:u1'])
  })
})
