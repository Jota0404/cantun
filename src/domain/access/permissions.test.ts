import { describe, expect, it } from 'vitest'
import permissionsDoc from '../../../docs/PERMISSIONS.md?raw'
import { hasPermission, PERMISSION_MATRIX, type AccessContext, type PermissionRule } from './permissions'

const SYMBOLS: Record<string, PermissionRule> = { '✅': true, '❌': false, '**L**': 'L', '**L\\***': 'L*', '**P**': 'P' }

function matrixFromDocs() {
  const rows: Record<string, PermissionRule[]> = {}
  for (const line of permissionsDoc.split('\n')) {
    const match = /^\| `([a-z_.]+)`[^|]*\|[^|]*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|/.exec(line)
    if (!match) continue
    rows[match[1]] = match.slice(2, 6).map((cell) => {
      const rule = SYMBOLS[cell.replace(/\(.*\)/, '').trim()]
      if (rule === undefined) throw new Error(`Símbolo desconhecido em ${match[1]}: ${cell}`)
      return rule
    })
  }
  return rows
}

const owner: AccessContext = { organizationRole: 'owner' }
const admin: AccessContext = { organizationRole: 'admin' }
const leader: AccessContext = { organizationRole: 'member', teamRole: 'leader', teamStatus: 'active', isActiveLeaderInOrganization: true }
const member: AccessContext = { organizationRole: 'member', teamRole: 'member', teamStatus: 'active' }

describe('permissions (UX mirror of docs/PERMISSIONS.md)', () => {
  it('matches the matrix in docs/PERMISSIONS.md exactly', () => {
    const docs = matrixFromDocs()
    const code = Object.fromEntries(Object.entries(PERMISSION_MATRIX).map(([cap, row]) => [cap, [row.owner, row.admin, row.leader, row.member]]))
    expect(code).toEqual(docs)
  })

  it('N1: a leader of team A has no team capability in team B', () => {
    const inOtherTeam: AccessContext = { ...leader, teamRole: null, teamStatus: null }
    for (const cap of ['team.rename', 'team_member.add', 'team_member.set_status', 'team_member.set_functions'] as const) {
      expect(hasPermission(inOtherTeam, cap)).toBe(false)
      expect(hasPermission(leader, cap)).toBe(true)
    }
  })

  it('N2/N3: a leader cannot change roles nor the status of a leader', () => {
    expect(hasPermission(leader, 'team_member.set_role')).toBe(false)
    expect(hasPermission(leader, 'team_member.set_leader_status')).toBe(false)
    expect(hasPermission(admin, 'team_member.set_leader_status')).toBe(true)
  })

  it('N4: an inactive leader has no leader power', () => {
    expect(hasPermission({ ...leader, teamStatus: 'inactive' }, 'team_member.add')).toBe(false)
  })

  it('N6/N7: a member acts only on own resources; a leader edits but does not delete others', () => {
    expect(hasPermission(member, 'team_member.set_functions')).toBe(false)
    expect(hasPermission({ ...member, isOwnResource: true }, 'team_member.set_own_functions')).toBe(true)
    expect(hasPermission(member, 'song.edit_own')).toBe(false)
    expect(hasPermission({ ...member, isOwnResource: true }, 'song.edit_own')).toBe(true)
    expect(hasPermission(leader, 'song.edit')).toBe(true)
    expect(hasPermission(leader, 'song.delete')).toBe(false)
    expect(hasPermission(member, 'song.edit')).toBe(false)
  })

  it('N9/N10/N14: no membership, anonymous or unknown capability is denied', () => {
    expect(hasPermission({ organizationRole: null }, 'song.create')).toBe(false)
    expect(hasPermission(owner, 'unknown.capability' as never)).toBe(false)
  })

  it('N11: a member inactive in every team loses organization capabilities', () => {
    const inactive: AccessContext = { organizationRole: 'member', isActiveInOrganization: false }
    for (const cap of ['song.create', 'repertoire.create', 'stage.run'] as const) expect(hasPermission(inactive, cap)).toBe(false)
    expect(hasPermission({ organizationRole: 'member' }, 'stage.run')).toBe(true)
  })

  it('N12/N13: admin cannot delete the organization; leader and member cannot create teams', () => {
    expect(hasPermission(admin, 'organization.delete')).toBe(false)
    expect(hasPermission(owner, 'organization.delete')).toBe(true)
    expect(hasPermission(leader, 'team.create')).toBe(false)
    expect(hasPermission(member, 'team.create')).toBe(false)
  })
})
