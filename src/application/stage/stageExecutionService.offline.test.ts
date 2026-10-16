import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { db } from '../../db/database'

vi.mock('../../platform/rpc', () => ({ rpc: vi.fn() }))
vi.mock('../../sync/stageRealtime', () => ({
  // Realtime que nunca conecta (offline): `connect` não resolve.
  StageRealtime: class { connect = () => new Promise(() => undefined) },
  toStageSnapshot: vi.fn(),
}))

import { StageExecutionService } from './stageExecutionService'

const now = '2026-10-01T12:00:00Z'

describe('StageExecutionService.connectOrLocal', () => {
  it('opens with the local session and state when realtime never connects', async () => {
    await db.stageSessions.put({ id: 'st1', serviceId: 'sv1', status: 'live', createdAt: now, updatedAt: now })
    await db.stageSessionStates.put({ stageSessionId: 'st1', revision: 3, currentIndex: 1, isRunning: false, updatedAt: now })
    const onStatus = vi.fn()

    const snapshot = await new StageExecutionService().connectOrLocal('st1', { onStatus }, 20)

    expect(snapshot.session.id).toBe('st1')
    expect(snapshot.state.revision).toBe(3)
    expect(onStatus).toHaveBeenCalledWith('DISCONNECTED')
  })

  it('fails with a clear message when nothing was pulled to the device', async () => {
    await expect(new StageExecutionService().connectOrLocal('missing', {}, 20)).rejects.toThrow('Sessão de palco não disponível offline.')
  })
})
