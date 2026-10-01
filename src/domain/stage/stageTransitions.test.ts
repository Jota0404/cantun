import { describe, expect, it } from 'vitest'
import { toBandStageState } from './bandStage'
import { toSharedExecutionState } from './sharedExecution'

describe('stage transitions', () => {
  it('maps prepared next from the authoritative state', () => {
    const state = toBandStageState({
      session_id: 'session-1',
      revision: 7,
      current_index: 2,
      current_song_id: 'song-3',
      current_key: 'G',
      prepared_index: 3,
      prepared_song_id: 'song-4',
      is_running: true,
      md_annotation: 'Preparar entrada',
      updated_at: '2026-09-08T22:00:07.000Z',
    })

    expect(toSharedExecutionState(state, 'live')).toMatchObject({
      currentIndex: 2,
      currentSongId: 'song-3',
      preparedIndex: 3,
      preparedSongId: 'song-4',
      status: 'running',
    })
  })

  it('represents a cleared preparation without changing current selection', () => {
    const state = toBandStageState({
      session_id: 'session-1',
      revision: 8,
      current_index: 2,
      current_song_id: 'song-3',
      current_key: 'G',
      prepared_index: null,
      prepared_song_id: null,
      is_running: false,
      updated_at: '2026-09-08T22:00:08.000Z',
    })

    expect(state.currentIndex).toBe(2)
    expect(state.currentSongId).toBe('song-3')
    expect(state.preparedIndex).toBeUndefined()
    expect(state.preparedSongId).toBeUndefined()
  })
})
