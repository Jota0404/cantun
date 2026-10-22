import { describe, expect, it } from 'vitest'
import { activityText, type ActivityEvent, type ActivityKind } from './activity'

const ev = (kind: ActivityKind, o: Partial<ActivityEvent> = {}): ActivityEvent =>
  ({ id: '1', kind, actorUserId: 'u1', serviceId: null, entityId: null, entityTitle: 'X', createdAt: '', ...o })
const names = { u1: 'Ana' }

describe('activityText', () => {
  it.each([
    ['service.ready', 'Serviço X ficou pronto · por Ana'],
    ['service.completed', 'Serviço X foi concluído · por Ana'],
    ['service.cancelled', 'Serviço X foi cancelado · por Ana'],
    ['assignment.confirmed', 'Ana confirmou presença em X'],
    ['assignment.declined', 'Ana recusou a escala em X'],
    ['assignment.replacement_needed', 'Precisa de substituto em X'],
    ['rehearsal.created', 'Ana criou um ensaio em X'],
    ['material.added', 'Ana adicionou o material X'],
    ['repertoire.updated', 'Ana atualizou o repertório X'],
  ] as const)('%s', (kind, text) => expect(activityText(ev(kind), names)).toBe(text))

  it('autor ausente ou desconhecido vira Ex-membro', () => {
    expect(activityText(ev('material.added', { actorUserId: null }), names)).toBe('Ex-membro adicionou o material X')
    expect(activityText(ev('material.added', { actorUserId: 'zz' }), names)).toBe('Ex-membro adicionou o material X')
  })
  it('service sem actor não tem sufixo; actor desconhecido vira Ex-membro', () => {
    expect(activityText(ev('service.ready', { actorUserId: null }), names)).toBe('Serviço X ficou pronto')
    expect(activityText(ev('service.ready', { actorUserId: 'zz' }), names)).toBe('Serviço X ficou pronto · por Ex-membro')
  })
  it('entidade excluída', () => {
    expect(activityText(ev('service.ready', { entityTitle: null }), names)).toBe('Serviço item excluído ficou pronto · por Ana')
  })
})
