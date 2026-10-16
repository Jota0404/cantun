import { describe, expect, it } from 'vitest'
import { labels } from './labels'

describe('labels', () => {
  it('uses Ministério for Organization and Banda for Team (RN-A11)', () => {
    expect(labels.organization).toBe('Ministério')
    expect(labels.organizations).toBe('Ministérios')
    expect(labels.team).toBe('Banda')
    expect(labels.teams).toBe('Bandas')
  })

  it('derived texts follow the same terms', () => {
    expect(labels.newTeam).toContain('banda')
    expect(labels.backToOrganization).toContain('Ministério')
    expect(labels.linkSongToOrganization).toContain('Ministério')
  })
})
