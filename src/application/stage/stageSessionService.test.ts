import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../platform/auth', () => ({ getCurrentUser: () => ({ id: 'me' }) }))
vi.mock('../../platform/rpc', () => ({ rpc: mocks.rpc }))
vi.mock('../../platform/http', () => ({ isPlatformConfigured: false }))

import { stageSessionRepository } from '../../db/repositories/stageSessionRepository'
import { startOrResumeStage } from './stageSessionService'

const sess = (id: string, status: 'lobby' | 'live' | 'ended') =>
  ({ id, serviceId: 's1', status, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' })
const sessionRow = (id: string, status: string) =>
  ({ id, service_id: 's1', status, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' })
const stateRow = (id: string) =>
  ({ stage_session_id: id, revision: 1, current_index: 0, current_service_item_id: null, current_song_id: null, current_key: null, updated_at: '2026-10-01T00:00:00Z' })

describe('startOrResumeStage', () => {
  beforeEach(async () => { mocks.rpc.mockReset(); await stageSessionRepository.listByServiceId('s1').then((l) => Promise.all(l.map((x) => stageSessionRepository.put({ ...x, status: 'ended' })))) })

  it('sessão live existente: não cria outra', async () => {
    await stageSessionRepository.put(sess('a', 'live'))
    expect((await startOrResumeStage('s1')).id).toBe('a')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('lobby existente é iniciada', async () => {
    await stageSessionRepository.put(sess('b', 'lobby'))
    mocks.rpc.mockResolvedValue(stateRow('b'))
    await startOrResumeStage('s1')
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith('target_stage_start', { p_stage_session_id: 'b' })
  })
  it('sem sessão cria e inicia', async () => {
    mocks.rpc.mockImplementation(async (name: string, args: Record<string, string>) =>
      name === 'create_target_stage_session' ? sessionRow(args.p_session_id, 'lobby') : stateRow(args.p_stage_session_id))
    await startOrResumeStage('s1')
    expect(mocks.rpc.mock.calls.map((c) => c[0])).toEqual(['create_target_stage_session', 'target_stage_start'])
  })
  it('MD é outra pessoa: entra sem chamar start', async () => {
    await stageSessionRepository.put({ ...sess('c', 'lobby'), mdUserId: 'other' })
    expect((await startOrResumeStage('s1')).id).toBe('c')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('MD próprio e live: não chama start', async () => {
    await stageSessionRepository.put({ ...sess('d', 'live'), mdUserId: 'me' })
    await startOrResumeStage('s1')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('MD próprio em lobby: chama start', async () => {
    await stageSessionRepository.put({ ...sess('e', 'lobby'), mdUserId: 'me' })
    mocks.rpc.mockResolvedValue(stateRow('e'))
    await startOrResumeStage('s1')
    expect(mocks.rpc).toHaveBeenCalledWith('target_stage_start', { p_stage_session_id: 'e' })
  })
})
