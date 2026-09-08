import { describe, expect, it } from 'vitest'
import { toBandStageSession, toBandStageState } from './bandStage'

describe('band stage boundary validation', () => {
  it('rejects an invalid session status', () => {
    expect(() => toBandStageSession({
      id: 'session-1',
      band_id: 'band-1',
      setlist_id: 'setlist-1',
      md_user_id: 'md-1',
      status: 'unknown',
      created_at: 'now',
      updated_at: 'now',
    })).toThrow(/status/i)
  })

  it('rejects malformed numeric and boolean state fields', () => {
    expect(() => toBandStageState({
      session_id: 'session-1',
      revision: 'seven',
      current_index: 0,
      is_running: false,
      updated_at: 'now',
    })).toThrow(/revision/i)

    expect(() => toBandStageState({
      session_id: 'session-1',
      revision: 1,
      current_index: -1,
      is_running: false,
      updated_at: 'now',
    })).toThrow(/current_index/i)

    expect(() => toBandStageState({
      session_id: 'session-1',
      revision: 1,
      current_index: 0,
      is_running: 'false',
      updated_at: 'now',
    })).toThrow(/is_running/i)
  })

  it('accepts a valid complete state including cleared preparation', () => {
    expect(toBandStageState({
      session_id: 'session-1',
      revision: 8,
      current_index: 2,
      current_song_id: 'song-3',
      current_key: 'G',
      prepared_index: null,
      prepared_song_id: null,
      is_running: false,
      md_annotation: 'Entrar no refrão',
      updated_at: '2026-09-08T22:00:08.000Z',
    })).toMatchObject({
      sessionId: 'session-1',
      revision: 8,
      currentIndex: 2,
      currentSongId: 'song-3',
      currentKey: 'G',
      isRunning: false,
      mdAnnotation: 'Entrar no refrão',
    })
  })
})
