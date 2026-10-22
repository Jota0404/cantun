// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccessContext } from '../../domain/access/permissions'
import type { Service } from '../../domain/services/service'
import type { ServiceItem } from '../../domain/services/serviceItem'
import { MAJOR_KEYS } from '../../domain/music/musicalKey'
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
  deleteService: vi.fn(),
  setServiceItemKey: vi.fn(),
  addReprise: vi.fn(),
  orgSongs: [] as unknown[],
}))
vi.mock('../../application/services/executionHistoryService', () => ({ getServiceExecution: async () => ({ success: true, execution: null }) }))
vi.mock('../../application/songs/listOrganizationSongs', () => ({ listOrganizationSongs: async () => m.orgSongs }))
vi.mock('../../application/songs/copySongToOrganization', () => ({ OFFLINE_COPY_MESSAGE: 'Sem conexão: tente de novo quando estiver online.' }))
vi.mock('../../application/songs/listSongs', () => ({ listSongs: async () => [{ id: 's1', title: 'Grande é o Senhor', currentKey: 'C', originalKey: 'C' }] }))
vi.mock('../../application/services/addReprise', () => ({ addReprise: m.addReprise }))
vi.mock('../../application/services/applyRepertoire', () => ({ setServiceItemKey: m.setServiceItemKey }))
vi.mock('../../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('../../components/schedule/ServiceSchedule', () => ({ ServiceSchedule: () => <section aria-label="Escala" /> }))
vi.mock('../../application/sync/remoteData', () => ({ onRemoteDataApplied: () => () => undefined }))
vi.mock('../../application/services/rehearsalService', () => ({ listRehearsals: async () => ({ success: true, rehearsals: [], canManage: false }), createRehearsal: vi.fn(), updateRehearsal: vi.fn(), deleteRehearsal: vi.fn() }))
vi.mock('../../application/services/materialService', () => ({ listMaterials: async () => ({ success: true, materials: [], canManage: false }), addMaterial: vi.fn(), updateMaterial: vi.fn(), deleteMaterial: vi.fn() }))
vi.mock('../../application/teams/teamMemberService', () => ({ getMyAccessContext: async () => m.access }))
vi.mock('../../application/stage/stageSessionService', () => ({ createStageSession: vi.fn(), startStageSession: vi.fn() }))
vi.mock('../../application/services/serviceService', () => ({
  getService: async () => m.service, listServiceAssignments: async () => [],
  transitionService: m.transitionService, updateServiceInfo: m.updateServiceInfo, deleteService: m.deleteService,
}))
vi.mock('../../application/services/serviceScheduleService', () => ({
  listServiceItems: async () => m.items, addServiceItem: m.addServiceItem, moveServiceItem: m.moveServiceItem, removeServiceItem: m.removeServiceItem,
}))

const base: Service = { id: 'sv1', organizationId: 'o1', teamId: 't1', name: 'Culto de domingo', startsAt: '2026-10-11T22:00:00.000Z', status: 'draft', createdByUserId: 'u1', createdAt: '', updatedAt: '' }
const items: ServiceItem[] = [
  { id: 'i1', serviceId: 'sv1', type: 'opening', title: 'Boas-vindas', position: 0, updatedAt: '' },
  { id: 'i2', serviceId: 'sv1', type: 'song', songId: 's1', position: 1, updatedAt: '' },
]
const leader: AccessContext = { organizationRole: 'member', teamRole: 'leader', teamStatus: 'active', isActiveLeaderInOrganization: true }

function renderWith(service: Partial<Service>, access: AccessContext, list: ServiceItem[] = items) {
  m.service = { ...base, ...service }
  m.items = list
  m.access = access
  render(<MemoryRouter initialEntries={['/services/sv1']}><Routes><Route path="/services/:serviceId" element={<ServiceDetailPage />} /></Routes></MemoryRouter>)
}

describe('ServiceDetailPage', () => {
  beforeEach(() => { m.setServiceItemKey.mockReset().mockResolvedValue({ success: true }); [m.transitionService, m.addServiceItem, m.moveServiceItem, m.removeServiceItem].forEach((fn) => fn.mockReset().mockResolvedValue({ success: true, items: [] })) })

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

  it('member sees the service read-only without edit controls', async () => {
    renderWith({}, { organizationRole: 'member', teamRole: 'member', teamStatus: 'active' })
    await screen.findByText('1. Boas-vindas')
    expect(screen.queryByRole('button', { name: /Subir|Remover|Editar informações/ })).not.toBeInTheDocument()
  })

  it('leader deletes drafts after confirming', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    m.deleteService.mockResolvedValue({ success: true })
    renderWith({}, leader)
    const remove = await screen.findByRole('button', { name: 'Excluir serviço' })
    await user.click(remove)
    expect(m.deleteService).toHaveBeenCalledWith('sv1')
  })

  it('leader cannot delete a ready service', async () => {
    renderWith({ status: 'ready' }, leader)
    await screen.findByText('Pronto')
    expect(screen.queryByRole('button', { name: 'Excluir serviço' })).not.toBeInTheDocument()
  })

  it('final service hides stage start and roster, owner still deletes', async () => {
    renderWith({ status: 'completed' }, { organizationRole: 'owner' })
    expect(await screen.findByRole('button', { name: 'Excluir serviço' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Iniciar palco' })).not.toBeInTheDocument()
  })

  it('stage start (D4): the team leader sees it', async () => {
    renderWith({ status: 'ready' }, leader)
    expect(await screen.findByRole('button', { name: 'Iniciar palco' })).toBeInTheDocument()
  })

  it('stage start (D4): a member does not', async () => {
    renderWith({ status: 'ready' }, { organizationRole: 'member', teamRole: 'member', teamStatus: 'active' })
    await screen.findByText('Pronto')
    expect(screen.queryByRole('button', { name: 'Iniciar palco' })).not.toBeInTheDocument()
  })

  it('owner starts the stage on an open service', async () => {
    renderWith({ status: 'ready' }, { organizationRole: 'owner' })
    expect(await screen.findByRole('button', { name: 'Iniciar palco' })).toBeInTheDocument()
  })

  it('adds a reprise to a song item (RN-10)', async () => {
    m.addReprise.mockReset().mockResolvedValue({ success: true })
    renderWith({}, leader)
    const trigger = await screen.findByRole('button', { name: 'Adicionar reprise/medley a Grande é o Senhor' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await userEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(document.activeElement).toBe(trigger)
    await userEvent.click(trigger)
    await userEvent.selectOptions(screen.getByLabelText('Tipo', { selector: '.service-reprise select' }), 'medley')
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar à ordem' }))
    expect(m.addReprise).toHaveBeenCalledWith('sv1', { type: 'medley', refItemId: 'i2' })
    expect(document.activeElement).toBe(trigger)
  })

  it('shows "volta da posição N" and confirms deleting a song with reprises (RN-11)', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderWith({}, leader, [...items, { id: 'i3', serviceId: 'sv1', type: 'reprise', title: 'Reprise: Grande é o Senhor', refItemId: 'i2', position: 2, updatedAt: '' }])
    expect(await screen.findByText('volta da posição 2')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remover Reprise: Grande é o Senhor (posição 3)' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Remover Grande é o Senhor' }))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('1 reprise/medley'))
    expect(m.removeServiceItem).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: 'Remover Grande é o Senhor' }))
    expect(m.removeServiceItem).toHaveBeenCalledWith('i2')
  })

  it('does not list a personal song twice once its Ministry copy exists', async () => {
    m.orgSongs = [{ id: 'c1', title: 'Grande é o Senhor', sourceSongId: 's1', organizationId: 'o1' }]
    renderWith({}, leader)
    expect(await screen.findAllByRole('option', { name: 'Grande é o Senhor' })).toHaveLength(1)
    m.orgSongs = []
  })

  describe('tom neste serviço', () => {
    it('sets and clears the key on song items only', async () => {
      const user = userEvent.setup()
      renderWith({}, leader)
      const select = await screen.findByLabelText('Tom neste serviço')
      expect(screen.getAllByLabelText('Tom neste serviço')).toHaveLength(1)
      expect(within(select).getAllByRole('option')).toHaveLength(MAJOR_KEYS.length + 1)
      await user.selectOptions(select, 'D')
      expect(m.setServiceItemKey).toHaveBeenCalledWith('i2', 'D')
      await user.selectOptions(select, 'Tom da música (C)')
      expect(m.setServiceItemKey).toHaveBeenCalledWith('i2', undefined)
    })

    it('shows the use case error as alert', async () => {
      m.setServiceItemKey.mockResolvedValue({ success: false, errors: ['Tom inválido.'] })
      renderWith({}, leader)
      await userEvent.setup().selectOptions(await screen.findByLabelText('Tom neste serviço'), 'D')
      expect(await screen.findByRole('alert')).toHaveTextContent('Tom inválido.')
    })

    it('is text only for a plain member', async () => {
      renderWith({}, { organizationRole: 'member', teamRole: 'member', teamStatus: 'active' })
      expect(await screen.findByText('Tom: C')).toBeInTheDocument()
      expect(screen.queryByLabelText('Tom neste serviço')).toBeNull()
    })

    it('offers only same-mode keys of the song', async () => {
      renderWith({}, leader)
      const select = await screen.findByLabelText('Tom neste serviço')
      expect(within(select).queryByRole('option', { name: 'Am' })).toBeNull()
    })

    it('is read-only when the service is completed', async () => {
      renderWith({ status: 'completed' }, leader)
      expect(await screen.findByText('Tom: C')).toBeInTheDocument()
      expect(screen.queryByLabelText('Tom neste serviço')).toBeNull()
    })
  })
})
