import { describe, expect, it } from 'vitest'
import type { AccessContext } from '../access/permissions'
import { normalizeDisplayName } from '../users/displayName'
import { canChangeRole, canChangeStatus, canRemoveMember, canSetFunctions } from './memberRules'

const admin: AccessContext = { organizationRole: 'admin' }
const leader: AccessContext = { organizationRole: 'member', teamRole: 'leader', teamStatus: 'active' }
const member: AccessContext = { organizationRole: 'member', teamRole: 'member', teamStatus: 'active' }
const activeMember = { userId: 'u-2', role: 'member', status: 'active' } as const
const inactiveMember = { ...activeMember, status: 'inactive' } as const
const activeLeader = { userId: 'u-3', role: 'leader', status: 'active' } as const

describe('member rules', () => {
  it('only owner/admin promote and demote (RN-04)', () => {
    expect(canChangeRole(admin, activeMember, 'leader')).toBe(true)
    expect(canChangeRole(leader, activeMember, 'leader')).toBe(false)
    expect(canChangeRole(admin, activeLeader, 'leader')).toBe(false)
  })

  it('leader (in)activates non-leaders only; leader status is owner/admin (RN-05, N3)', () => {
    expect(canChangeStatus(leader, activeMember, 'inactive')).toBe(true)
    expect(canChangeStatus(leader, inactiveMember, 'active')).toBe(true)
    expect(canChangeStatus(leader, activeLeader, 'inactive')).toBe(false)
    expect(canChangeStatus(admin, activeLeader, 'inactive')).toBe(true)
    expect(canChangeStatus(member, activeMember, 'inactive')).toBe(false)
  })

  it('functions: own for members, any active member for leaders, inactive only for admins (RN-07, N5, N6)', () => {
    expect(canSetFunctions(member, { ...activeMember, userId: 'me' }, 'me')).toBe(true)
    expect(canSetFunctions(member, activeMember, 'me')).toBe(false)
    expect(canSetFunctions(leader, activeMember, 'me')).toBe(true)
    expect(canSetFunctions(leader, inactiveMember, 'me')).toBe(false)
    expect(canSetFunctions(admin, inactiveMember, 'me')).toBe(true)
  })

  it('remove: leader only members, owner/admin also leaders, never self, member never (B8 RN-07, N3, N6)', () => {
    expect(canRemoveMember(leader, activeMember, 'me')).toBe(true)
    expect(canRemoveMember(leader, activeLeader, 'me')).toBe(false)
    expect(canRemoveMember(admin, activeLeader, 'me')).toBe(true)
    expect(canRemoveMember(admin, { ...activeMember, userId: 'me' }, 'me')).toBe(false)
    expect(canRemoveMember(member, activeMember, 'me')).toBe(false)
    expect(canRemoveMember(leader, { ...activeMember, organizationRole: 'admin' }, 'me')).toBe(false)
    expect(canRemoveMember(admin, { ...activeMember, organizationRole: 'owner' }, 'me')).toBe(false)
    expect(canRemoveMember({ organizationRole: 'owner' }, { ...activeMember, organizationRole: 'admin' }, 'me')).toBe(true)
  })

  it('display name is 1–80 characters after trim (RN-15)', () => {
    expect(normalizeDisplayName('  Ana  ')).toBe('Ana')
    expect(normalizeDisplayName('   ')).toBeNull()
    expect(normalizeDisplayName('a'.repeat(81))).toBeNull()
    expect(normalizeDisplayName('a'.repeat(80))).toHaveLength(80)
  })
})
