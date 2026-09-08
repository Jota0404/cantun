import { describe, expect, it, vi } from 'vitest'
import { normalizeBandStageAnnotation, setMyBandStageAnnotation } from './bandStageAnnotationService'

describe('bandStageAnnotationService', () => {
  it('normalizes blank annotations to null', () => {
    expect(normalizeBandStageAnnotation('   ')).toBeNull()
    expect(normalizeBandStageAnnotation(undefined)).toBeNull()
  })

  it('trims and caps annotations before sending them to the RPC', async () => {
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => ({
      data: {
        session_id: 's1', revision: 4, current_index: 1, current_song_id: 'song1',
        current_key: 'C', is_running: true, md_annotation: args.p_annotation, updated_at: 'now',
      }, error: null,
    }))

    const state = await setMyBandStageAnnotation('s1', `  ${'x'.repeat(600)}  `, { rpc })

    expect(rpc).toHaveBeenCalledWith('band_stage_set_annotation', {
      p_session_id: 's1',
      p_annotation: 'x'.repeat(500),
    })
    expect(state.mdAnnotation).toBe('x'.repeat(500))
  })
})
