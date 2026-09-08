import { describe, expect, it } from 'vitest'
import { getMusicalRoleStageExperience, getMyBandMusicalRoleForStage, getMyBandStageExperience } from './musicalRoleStageService'

describe('musicalRoleStageService', () => {
  it('returns role-specific stage defaults', () => {
    expect(getMusicalRoleStageExperience('vocals').fontSize).toBe(22)
    expect(getMusicalRoleStageExperience('drums').readMode).toBe('pages')
    expect(getMusicalRoleStageExperience('drums').showKey).toBe(false)
    expect(getMusicalRoleStageExperience('bass').showNotes).toBe(false)
  })

  it('uses the shared domain label', () => {
    expect(getMusicalRoleStageExperience('electric-guitar').accentLabel).toBe('Guitarra elétrica')
    expect(getMusicalRoleStageExperience('other').accentLabel).toBe('Outro')
  })

  it('reads the server materialized experience', async () => {
    const calls: string[] = []
    const client = {
      async rpc(name: string, args: Record<string, unknown>) {
        calls.push(`${name}:${args.p_band_id}`)
        return {
          data: {
            musical_role: 'drums',
            font_size: 19,
            read_mode: 'pages',
            show_notes: false,
            show_bpm: true,
            show_key: false,
          },
          error: null,
        }
      },
    }

    await expect(getMyBandStageExperience('band-1', client)).resolves.toMatchObject({
      fontSize: 19,
      readMode: 'pages',
      showNotes: false,
      showBpm: true,
      showKey: false,
      accentLabel: 'Bateria',
    })
    expect(calls).toEqual(['get_my_band_stage_experience:band-1'])
  })

  it('falls back to the role RPC when the experience RPC is unavailable', async () => {
    const calls: string[] = []
    const client = {
      async rpc(name: string, args: Record<string, unknown>) {
        calls.push(`${name}:${args.p_band_id}`)
        if (name === 'get_my_band_stage_experience') return { data: null, error: { message: 'missing function' } }
        return { data: 'bass', error: null }
      },
    }

    await expect(getMyBandStageExperience('band-1', client)).resolves.toMatchObject({ fontSize: 24, showNotes: false, accentLabel: 'Baixo' })
    expect(calls).toEqual(['get_my_band_stage_experience:band-1', 'get_my_band_musical_role:band-1'])
  })

  it('loads the authenticated member role through the existing RPC', async () => {
    const client = {
      async rpc() {
        return { data: ['bass'], error: null }
      },
    }

    await expect(getMyBandMusicalRoleForStage('band-1', client)).resolves.toBe('bass')
  })
})
