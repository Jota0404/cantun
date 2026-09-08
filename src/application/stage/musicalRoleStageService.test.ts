import { describe, expect, it } from 'vitest'
import { getMusicalRoleStageExperience, getMyBandMusicalRoleForStage } from './musicalRoleStageService'

describe('musicalRoleStageService', () => {
  it('returns a role-specific experience', () => {
    expect(getMusicalRoleStageExperience('vocals').fontSize).toBe(24)
    expect(getMusicalRoleStageExperience('drums').readMode).toBe('pages')
    expect(getMusicalRoleStageExperience('drums').showKey).toBe(false)
  })

  it('falls back to the generic experience for other', () => {
    expect(getMusicalRoleStageExperience('other')).toEqual({
      fontSize: 22,
      readMode: 'scroll',
      showNotes: true,
      showBpm: true,
      showKey: true,
      accentLabel: 'Função musical',
    })
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
