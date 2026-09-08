import { describe, expect, it } from 'vitest'
import { getMusicalRoleStageExperience, getMyBandMusicalRoleForStage } from './musicalRoleStageService'

describe('musicalRoleStageService', () => {
  it('returns a role-specific experience', () => {
    expect(getMusicalRoleStageExperience('vocals').fontSize).toBe(24)
    expect(getMusicalRoleStageExperience('drums').readMode).toBe('pages')
    expect(getMusicalRoleStageExperience('drums').showKey).toBe(false)
    expect(getMusicalRoleStageExperience('bass').showNotes).toBe(false)
  })

  it('uses the shared domain label for the role', () => {
    expect(getMusicalRoleStageExperience('electric-guitar').accentLabel).toBe('Guitarra elétrica')
    expect(getMusicalRoleStageExperience('other').accentLabel).toBe('Outro')
  })

  it('keeps the generic defaults for other', () => {
    const experience = getMusicalRoleStageExperience('other')
    expect(experience.fontSize).toBe(22)
    expect(experience.readMode).toBe('scroll')
    expect(experience.showNotes).toBe(true)
    expect(experience.showBpm).toBe(true)
    expect(experience.showKey).toBe(true)
  })

  it('loads the authenticated member role through the existing RPC', async () => {
    const calls: string[] = []
    const client = {
      async rpc(name: string, args: Record<string, unknown>) {
        calls.push(`${name}:${args.p_band_id}`)
        return { data: 'bass', error: null }
      },
    }

    await expect(getMyBandMusicalRoleForStage('band-1', client)).resolves.toBe('bass')
    expect(calls).toEqual(['get_my_band_musical_role:band-1'])
  })
})
