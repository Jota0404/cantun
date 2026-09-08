import { describe, expect, it, vi } from 'vitest'
import { BandStageService, type BandStageRpcClient } from './bandStageService'

type RpcResult = { data: unknown; error: { message: string } | null }

function row(session: Record<string, unknown>) {
  return session
}

function makeClient(): BandStageRpcClient & { calls: string[] } {
  const calls: string[] = []
  let revision = 0
  return {
    calls,
    async rpc(name: string): Promise<RpcResult> {
      calls.push(name)
      if (name === 'band_stage_next') revision += 1
      if (name === 'get_band_stage_snapshot') {
        return { data: {
          session: row({ id: 's1', band_id: 'b1', setlist_id: 'sl1', md_user_id: 'md1', status: 'live', created_at: '2026-09-08T00:00:00Z', started_at: '2026-09-08T00:00:01Z', ended_at: null, updated_at: '2026-09-08T00:00:02Z' }),
          state: row({ session_id: 's1', revision, current_index: revision, current_song_id: revision ? 'song2' : null, current_key: null, is_running: true, updated_at: '2026-09-08T00:00:02Z' }),
        }, error: null }
      }
      return { data: row({ session_id: 's1', revision, current_index: revision, current_song_id: revision ? 'song2' : null, current_key: null, is_running: true, updated_at: '2026-09-08T00:00:02Z' }), error: null }
    },
  }
}

describe('BandStageService', () => {
  it('uses the protected RPC and publishes the authoritative revision', async () => {
    const client = makeClient()
    const publish = vi.fn(async () => undefined)
    const connect = vi.fn(async () => ({
      session: { id: 's1', bandId: 'b1', setlistId: 'sl1', mdUserId: 'md1', status: 'live' as const, createdAt: '', startedAt: '', updatedAt: '' },
      state: { sessionId: 's1', revision: 0, currentIndex: 0, isRunning: true, updatedAt: '' },
    }))
    const fakeRealtime = { publish, connect, disconnect: vi.fn(), reconnect: vi.fn(), refresh: vi.fn() }
    const service = new BandStageService({
      client,
      realtimeFactory: () => fakeRealtime as never,
    })

    await service.connect('s1')
    const result = await service.next('s1')

    expect(client.calls).toEqual(['band_stage_next', 'get_band_stage_snapshot'])
    expect(result.state.revision).toBe(1)
    expect(result.event.revision).toBe(1)
    expect(publish).toHaveBeenCalledOnce()
    expect(publish.mock.calls[0][0].type).toBe('stage.next')
  })

  it('does not enqueue stage commands in the generic sync queue', async () => {
    const client = makeClient()
    const service = new BandStageService({ client, realtimeFactory: () => ({
      publish: vi.fn(async () => undefined),
      connect: vi.fn(async () => ({
        session: { id: 's1', bandId: 'b1', setlistId: 'sl1', mdUserId: 'md1', status: 'live', createdAt: '', startedAt: '', updatedAt: '' },
        state: { sessionId: 's1', revision: 0, currentIndex: 0, isRunning: true, updatedAt: '' },
      })),
      disconnect: vi.fn(async () => undefined),
      reconnect: vi.fn(),
      refresh: vi.fn(),
    }) as never })

    await service.connect('s1')
    await service.play('s1')

    expect(client.calls).toContain('band_stage_play')
    expect(client.calls).not.toContain('band_sync')
  })
})
