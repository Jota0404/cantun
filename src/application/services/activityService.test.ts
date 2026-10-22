import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../platform/http'
import { getRecentActivity } from './activityService'

const row = { id: 'a', kind: 'service.completed', actor_user_id: 'u1', service_id: 's1', entity_id: 's1', entity_title: 'Culto', created_at: '2026-10-22T10:00:00Z' }
const displayNames = async () => ({ u1: 'Ana' })

describe('getRecentActivity', () => {
  it('mapeia eventos com texto', async () => {
    const call = vi.fn().mockResolvedValue([row, { ...row, id: 'b', kind: 'material.added', actor_user_id: null, entity_title: null, service_id: null }])
    const r = await getRecentActivity('o1', { call: call as never, displayNames })
    expect(call).toHaveBeenCalledWith('get_recent_activity', { p_organization_id: 'o1' })
    expect(r).toEqual({ success: true, events: [
      { id: 'a', kind: 'service.completed', text: 'Serviço Culto foi concluído · por Ana', serviceId: 's1', createdAt: row.created_at },
      { id: 'b', kind: 'material.added', text: 'Ex-membro adicionou o material item excluído', serviceId: null, createdAt: row.created_at },
    ] })
  })
  it('erro da API e sem rede', async () => {
    const api = vi.fn().mockRejectedValue(new ApiError(403, 'Sem permissão'))
    expect(await getRecentActivity('o1', { call: api as never, displayNames })).toEqual({ success: false, errors: ['Sem permissão'] })
    const off = vi.fn().mockRejectedValue(new Error('x'))
    expect(await getRecentActivity('o1', { call: off as never, displayNames })).toEqual({ success: false, errors: ['Disponível com conexão.'] })
  })
})
