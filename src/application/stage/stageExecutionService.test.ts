import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../platform/rpc', () => ({ rpc: mocks.rpc }))
vi.mock('../../platform/auth', () => ({ getCurrentUser: () => ({ id: 'user-1', email: 'md@example.com', emailVerified: true }) }))

vi.mock('../../sync/stageRealtime', () => ({
  StageRealtime: class {
    async connect() { return null }
    async disconnect() {}
    async trackPresence() {}
    async reconnect() { return null }
    async refresh() { return null }
    async publish() {}
  },
}))

import { StageExecutionService } from './stageExecutionService'

function snapshot() {
  return {
    session: {
      id: 'stage-1',
      service_id: 'service-1',
      md_user_id: 'user-1',
      status: 'live',
      created_at: '2026-10-01T12:00:00Z',
      updated_at: '2026-10-01T12:00:00Z',
    },
    state: {
      stage_session_id: 'stage-1',
      revision: 2,
      current_index: 0,
      current_service_item_id: 'item-1',
      current_song_id: 'song-1',
      current_key: 'C',
      is_running: false,
      updated_at: '2026-10-01T12:00:00Z',
    },
  }
}

describe('StageExecutionService', () => {
  it('reads snapshots from the target Stage RPC', async () => {
    mocks.rpc.mockResolvedValueOnce(snapshot())

    const service = new StageExecutionService()
    const result = await service.getSnapshot('stage-1')

    expect(mocks.rpc).toHaveBeenCalledWith('get_target_stage_snapshot', {
      p_stage_session_id: 'stage-1',
    })
    expect(result.session.id).toBe('stage-1')
    expect(result.state.stageSessionId).toBe('stage-1')
  })

  it('executes commands through target RPCs', async () => {
    mocks.rpc
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce({
        stage_session_id: 'stage-1',
        revision: 3,
        current_index: 0,
        current_service_item_id: 'item-1',
        current_song_id: 'song-1',
        current_key: 'C',
        is_running: true,
        updated_at: '2026-10-01T12:00:01Z',
      })
      .mockResolvedValueOnce({
        ...snapshot(),
        state: {
          ...snapshot().state,
          revision: 3,
          is_running: true,
          updated_at: '2026-10-01T12:00:01Z',
        },
      })

    const service = new StageExecutionService()
    const result = await service.play('stage-1')

    expect(mocks.rpc).toHaveBeenCalledWith('target_stage_play', {
      p_stage_session_id: 'stage-1',
    })
    expect(result.state.revision).toBe(3)
    expect(result.state.isRunning).toBe(true)
  })
})
