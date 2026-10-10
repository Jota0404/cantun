// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccessContext } from '../../domain/access/permissions'
import type { Service } from '../../domain/services/service'
import type { ServiceItem } from '../../domain/services/serviceItem'
import { ServiceDetailPage } from './ServiceDetailPage'

const m = vi.hoisted(() => ({
  service: undefined as unknown,
  items: [] as unknown[],
  access: { organizationRole: null } as unknown,
  transitionService: vi.fn(),
  updateServiceInfo: vi.fn(),
  addServiceItem: vi.fn(),
  moveServiceItem: vi.fn(),
  removeServiceItem: vi.fn(),
}))
vi.mock('../../db/repositories/serviceRepository', () => ({ serviceRepository: { getById: async () => m.service } }))
vi.mock('../../db/repositories/serviceItemRepository', () => ({ serviceItemRepository: { listByServiceId: async () => m.items } }))
vi.mock('../../db/repositories/assignmentRepository', () => ({ assignmentRepository: { listByServiceId: async () => [] } }))
vi.mock('../../application/songs/listSongs', () => ({ listSongs: async () => [{ id: 's1', title: 'Grande é o Senhor' }] }))
vi.mock('../../application/sync/remoteData', () => ({ onRemoteDataApplied: () => () => undefined }))
vi.mock('../../application/teams/teamMemberService', () => ({ getMyAccessContext: async () => m.access }))
vi.mock('../../application/stage/stageSessionService', () => ({ createStageSession: vi.fn(), startStageSession: vi.fn() }))
vi.mock('../../application/services/serviceService', () => ({
  createAssignment: vi.fn(), removeAssignment: vi.fn(), updateAssignment: vi.fn(),
  transitionService: m.transitionService, updateServiceInfo: m.updateServiceInfo,
}))
vi.mock('../../application/services/serviceScheduleService', () => ({
  addServiceItem: m.addServiceItem, moveServiceItem: m.moveServiceItem, removeServiceItem: m.removeServiceItem,
}))

const base: Service = { id: 'sv1', organizationId: 'o1', teamId: 't1', name: 'Culto de domingo', startsAt: '2026-10-11T22:00:00.000Z', status: 'draft', createdByUserId: 'u1', createdAt: '', updatedAt: '' }
const items: ServiceItem[] = [
  { id: 'i1', serviceId: 'sv1', type: 'opening', title: 'Boas-vindas', position: 0, updatedAt: '' },
  { id: 'i2', serviceId: 'sv1', type: 'song', songId: 's1', position: 1, updatedAt: '' },
]
const leader: AccessContext = { organizationRole: 'member', teamRole: 'leader', teamStatus: 'active', isActiveLeaderInOrganization: true }

function renderWith(service: Partial<Service>, access: AccessContext) {
  m.service = { ...base, ...service }
  m.items = items
  m.access = access
  render(<MemoryRouter initialEntries={['/services/sv1']}><Routes><Route path="/services/:serviceId" element={<ServiceDetailPage />} /></Routes></MemoryRouter>)
}

describe('ServiceDetailPage', () => {
  beforeEach(() => { [m.transitionService, m.addServiceItem, m.moveServiceItem, m.removeServiceItem].forEach((fn) => fn.mockReset().mockResolvedValue({ success: true, items: [] })) })

  it('shows status in text and only allowed transitions', async () => {
    renderWith({}, leader)
    expect(await screen.findByText('Em planejamento')).toBeInTheDocument()
    const status = screen.getByRole('region', { name: 'Mudar status' })
    expect(within(status).getAllByRole('button').map((b) => b.textContent)).toEqual(['Marcar como pronto', 'Cancelar serviço'])
    await userEvent.setup().click(within(status).getByRole('button', { name: 'Marcar como pronto' }))
    expect(m.transitionService).toHaveBeenCalledWith('sv1', 'ready')
  })

  it('lists items of every type and reorders by keyboard buttons', async () => {
    const user = userEvent.setup()
    renderWith({}, leader)
    expect(await screen.findByText('1. Boas-vindas')).toBeInTheDocument()
    expect(screen.getByText('2. Grande é o Senhor')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Subir Grande é o Senhor' }))
    expect(m.moveServiceItem).toHaveBeenCalledWith('sv1', 'i2', 0)
    await user.click(screen.getByRole('button', { name: 'Remover Boas-vindas' }))
    expect(m.removeServiceItem).toHaveBeenCalledWith('i1')
  })

  it('adds a non-musical item and blocks one without title', async () => {
    const user = userEvent.setup()
    renderWith({}, leader)
    const form = await screen.findByRole('form', { name: 'Adicionar item' })
    await user.selectOptions(within(form).getByLabelText('Tipo'), 'prayer')
    await user.type(within(form).getByLabelText('Título'), 'Oração inicial')
    await user.type(within(form).getByLabelText('Duração em minutos (opcional)'), '5')
    await user.click(within(form).getByRole('button', { name: 'Adicionar item' }))
    expect(m.addServiceItem).toHaveBeenCalledWith('sv1', { type: 'prayer', songId: undefined, title: 'Oração inicial', notes: undefined, durationMinutes: 5 })
  })

  it('final service and member cannot edit', async () => {
    renderWith({ status: 'completed' }, leader)
    expect(await screen.findByText(/não podem mais ser editadas/)).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Adicionar item' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Mudar status' })).not.toBeInTheDocument()
  })

  it('member sees the service read-only, with materials and rehearsal placeholders', async () => {
    renderWith({}, { organizationRole: 'member', teamRole: 'member', teamStatus: 'active' })
    await screen.findByText('1. Boas-vindas')
    expect(screen.queryByRole('button', { name: /Subir|Remover|Editar informações/ })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Materiais' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Ensaio' })).toBeInTheDocument()
  })
})
