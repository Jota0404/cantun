// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccessContext } from '../../domain/access/permissions'
import type { Service } from '../../domain/services/service'
import { ServiceSchedule } from './ServiceSchedule'

const m = vi.hoisted(() => ({
  gaps: [] as unknown[], assignments: [] as unknown[], suggestions: [] as unknown[],
  assignMember: vi.fn(), confirmAssignment: vi.fn(), declineAssignment: vi.fn(), replaceAssignment: vi.fn(),
  createPosition: vi.fn(), removePosition: vi.fn(), updatePosition: vi.fn(), cancelAssignment: vi.fn(),
  requestReplacement: vi.fn(), resendAssignmentInvite: vi.fn(),
}))
vi.mock('../../application/sync/remoteData', () => ({ onRemoteDataApplied: () => () => undefined }))
vi.mock('../../application/teams/teamMemberService', () => ({
  listTeamMembers: async () => [{ userId: 'ana', displayName: 'Ana' }, { userId: 'me', displayName: 'Eu' }],
}))
vi.mock('../../application/services/scheduleService', () => ({
  getServiceGaps: async () => ({ gaps: m.gaps }),
  listAssignments: async () => m.assignments,
  suggestForPosition: async () => m.suggestions,
  assignMember: m.assignMember, confirmAssignment: m.confirmAssignment, declineAssignment: m.declineAssignment,
  replaceAssignment: m.replaceAssignment, createPosition: m.createPosition, removePosition: m.removePosition,
  updatePosition: m.updatePosition, cancelAssignment: m.cancelAssignment, requestReplacement: m.requestReplacement,
  resendAssignmentInvite: m.resendAssignmentInvite,
}))

const service: Service = { id: 'sv1', organizationId: 'o1', teamId: 't1', name: 'Culto', startsAt: '2026-10-11T22:00:00.000Z', status: 'draft', createdByUserId: 'u', createdAt: '', updatedAt: '' }
const position = { id: 'p1', serviceId: 'sv1', musicalFunction: 'vocals', quantity: 2, createdAt: '', updatedAt: '' }
const manager: AccessContext = { organizationRole: 'owner' }
const member: AccessContext = { organizationRole: 'member', teamRole: 'member', teamStatus: 'active' }
const assignment = (id: string, userId: string, status: string) => ({ id, serviceId: 'sv1', positionId: 'p1', userId, musicalFunction: 'vocals', status, createdAt: '', updatedAt: '' })

function setup(access: AccessContext, svc: Service = service) {
  render(<ServiceSchedule service={svc} access={access} currentUserId="me" />)
}

describe('ServiceSchedule', () => {
  beforeEach(() => {
    Object.values(m).forEach((value) => { if (typeof value === 'function' && 'mockReset' in value) value.mockReset().mockResolvedValue({ success: true }) })
    m.gaps = [{ position, confirmed: 1, invited: 0, missing: 1, uninvited: 1, state: 'open' }]
    m.assignments = [assignment('a1', 'ana', 'confirmed'), assignment('a2', 'me', 'invited')]
    m.suggestions = [
      { userId: 'ana', displayName: 'Ana', hasFunction: true, availability: 'unavailable', warnings: ['unavailable'] },
      { userId: 'bia', displayName: 'Bia', hasFunction: false, warnings: ['busy'] },
    ]
  })

  it('shows the gap in text, separating waiting from uninvited', async () => {
    setup(manager)
    const card = await screen.findByRole('listitem', { name: 'Vaga de Voz' })
    expect(within(card).getByText('1 de 2 confirmado(s)')).toBeInTheDocument()
    expect(within(card).getByText('Faltam 1: 0 aguardando resposta, 1 sem convite')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Faltam 1 pessoa(s) confirmada(s) em 1 vaga(s).')
    expect(within(card).getAllByText(/Ana/).length).toBeGreaterThan(0)
    expect(within(card).getAllByText(/Confirmado/).length).toBeGreaterThan(0)
  })

  it('invites from suggestions with warnings and never blocks', async () => {
    const user = userEvent.setup()
    setup(manager)
    await user.click(await screen.findByRole('button', { name: 'Convidar para Voz' }))
    const picker = screen.getByRole('region', { name: 'Convidar para Voz' })
    expect(within(picker).getByText(/Atenção: marcou indisponível/)).toBeInTheDocument()
    expect(within(picker).getByText(/já escalado em outro serviço/)).toBeInTheDocument()
    await user.click(within(picker).getByRole('button', { name: 'Escalar Ana' }))
    expect(m.assignMember).toHaveBeenCalledWith('p1', 'ana')
  })

  it('holder confirms or declines own invite; a manager does not respond for others', async () => {
    const user = userEvent.setup()
    setup(manager)
    await user.click(await screen.findByRole('button', { name: /Confirmar de Você/ }))
    expect(m.confirmAssignment).toHaveBeenCalledWith('a2')
    expect(screen.getByRole('button', { name: /Recusar de Você/ })).toBeInTheDocument()
  })

  it('a replacement request lets the manager pick a substitute', async () => {
    const user = userEvent.setup()
    m.assignments = [assignment('a1', 'ana', 'replacement_needed')]
    setup(manager)
    await user.click(await screen.findByRole('button', { name: /Escolher substituto/ }))
    await user.click(within(screen.getByRole('region', { name: 'Escolher substituto' })).getByRole('button', { name: 'Escalar Bia' }))
    expect(m.replaceAssignment).toHaveBeenCalledWith('a1', 'bia')
  })

  it('member cannot manage positions; final service is read-only', async () => {
    setup(member)
    await screen.findByRole('listitem', { name: 'Vaga de Voz' })
    expect(screen.queryByRole('button', { name: /Convidar|Excluir vaga|Editar vaga/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Nova vaga' })).not.toBeInTheDocument()
  })

  it('final service hides every action', async () => {
    setup(manager, { ...service, status: 'completed' })
    await screen.findByRole('listitem', { name: 'Vaga de Voz' })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('creates a position and shows server errors from removal', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    m.removePosition.mockResolvedValue({ success: false, errors: ['Cancele as pessoas escaladas antes de excluir a vaga.'] })
    setup(manager)
    const form = await screen.findByRole('form', { name: 'Nova vaga' })
    expect(within(form).queryByRole('option', { name: 'Voz' })).not.toBeInTheDocument()
    await user.selectOptions(within(form).getByLabelText('Função'), 'drums')
    await user.click(within(form).getByRole('button', { name: 'Adicionar vaga' }))
    expect(m.createPosition).toHaveBeenCalledWith({ serviceId: 'sv1', musicalFunction: 'drums', quantity: 1, notes: undefined })
    await user.click(screen.getByRole('button', { name: 'Excluir vaga de Voz' }))
    expect(confirm).toHaveBeenCalledWith('Excluir vaga? O histórico de recusas desta vaga será apagado.')
    expect(await screen.findByRole('alert')).toHaveTextContent('Cancele as pessoas escaladas')
  })

  it('online-only actions are disabled and explained when offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    setup(manager)
    expect(await screen.findByRole('note')).toHaveTextContent('sem conexão')
    expect(screen.getByRole('button', { name: 'Convidar para Voz' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Confirmar de Você/ })).toBeDisabled()
  })
})
