// @vitest-environment jsdom

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccessContext } from '../../domain/access/permissions'
import type { Service } from '../../domain/services/service'
import type { ServiceItem } from '../../domain/services/serviceItem'
import { MAJOR_KEYS } from '../../domain/music/musicalKey'
import { ServiceDetailPage } from './ServiceDetailPage'
import { startOrResumeStage } from '../../application/stage/stageSessionService'

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
  applied: [] as Array<() => void>,
}))
vi.mock('../../application/services/executionHistoryService', () => ({ getServiceExecution: async () => ({ success: true, execution: null }) }))
vi.mock('../../application/songs/listOrganizationSongs', () => ({ listOrganizationSongs: async () => m.orgSongs }))
vi.mock('../../application/songs/copySongToOrganization', () => ({ OFFLINE_COPY_MESSAGE: 'Sem conexão: tente de novo quando estiver online.' }))
vi.mock('../../application/songs/listSongs', () => ({ listSongs: async () => [{ id: 's1', title: 'Grande é o Senhor', currentKey: 'C', originalKey: 'C' }] }))
vi.mock('../../application/services/addReprise', () => ({ addReprise: m.addReprise }))
vi.mock('../../application/services/applyRepertoire', () => ({ setServiceItemKey: m.setServiceItemKey }))
vi.mock('../../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('../../components/schedule/ServiceSchedule', () => ({ ServiceSchedule: () => <section aria-label="Escala" /> }))
vi.mock('../../application/sync/remoteData', () => ({ onRemoteDataApplied: (cb: () => void) => { m.applied.push(cb); return () => undefined } }))
vi.mock('../../application/services/rehearsalService', () => ({ listRehearsals: async () => ({ success: true, rehearsals: [], canManage: false }), createRehearsal: vi.fn(), updateRehearsal: vi.fn(), deleteRehearsal: vi.fn() }))
vi.mock('../../application/services/materialService', () => ({ listMaterials: async () => ({ success: true, materials: [], canManage: false }), addMaterial: vi.fn(), updateMaterial: vi.fn(), deleteMaterial: vi.fn() }))
vi.mock('../../application/teams/teamMemberService', () => ({ getMyAccessContext: async () => m.access }))
vi.mock('../../application/stage/stageSessionService', () => ({ startOrResumeStage: vi.fn() }))
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
  render(<MemoryRouter initialEntries={['/services/sv1']}><Routes><Route path="/services/:serviceId" element={<ServiceDetailPage />} /><Route path="/stage/service-session/:id" element={<p>Palco aberto</p>} /></Routes></MemoryRouter>)
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name }))
}

describe('ServiceDetailPage', () => {
  beforeEach(() => { m.setServiceItemKey.mockReset().mockResolvedValue({ success: true }); [m.transitionService, m.addServiceItem, m.moveServiceItem, m.removeServiceItem].forEach((fn) => fn.mockReset().mockResolvedValue({ success: true, items: [] })) })

  it('service deleted remotely shows only the not-found state with a way back', async () => {
    renderWith({}, leader)
    expect(await screen.findByText('Em planejamento')).toBeInTheDocument()
    m.service = undefined
    await act(async () => { m.applied.forEach((cb) => cb()) })
    expect(await screen.findByRole('alert')).toHaveTextContent('Serviço não encontrado.')
    expect(screen.getByRole('link', { name: 'Voltar para Serviços' })).toHaveAttribute('href', '/servicos')
    expect(screen.queryByRole('region', { name: 'Mudar status' })).toBeNull()
    expect(screen.queryByText('Em planejamento')).toBeNull()
  })

  it('shows status in text and only allowed transitions', async () => {
    renderWith({}, leader)
    expect(await screen.findByText('Em planejamento')).toBeInTheDocument()
    const user = userEvent.setup()
    await openMenu(user, 'Mais ações do serviço')
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Editar informações', 'Marcar como pronto', 'Cancelar serviço', 'Excluir serviço'])
    await user.click(screen.getByRole('menuitem', { name: 'Marcar como pronto' }))
    expect(m.transitionService).toHaveBeenCalledWith('sv1', 'ready')
    expect(await screen.findByRole('status')).toHaveTextContent('Status: Pronto.')
  })

  it('lists items of every type and reorders by keyboard buttons', async () => {
    const user = userEvent.setup()
    renderWith({}, leader)
    expect(await screen.findByText('1. Boas-vindas')).toBeInTheDocument()
    expect(screen.getByText('2. Grande é o Senhor')).toBeInTheDocument()
    await openMenu(user, 'Mais ações de Grande é o Senhor')
    await user.click(screen.getByRole('menuitem', { name: 'Subir Grande é o Senhor' }))
    expect(m.moveServiceItem).toHaveBeenCalledWith('sv1', 'i2', 0)
    await openMenu(user, 'Mais ações de Boas-vindas')
    expect(screen.queryByRole('menuitem', { name: /Subir/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Remover Boas-vindas' }))
    expect(m.removeServiceItem).toHaveBeenCalledWith('i1')
  })

  it('adds a non-musical item and blocks one without title', async () => {
    const user = userEvent.setup()
    renderWith({}, leader)
    await user.click(await screen.findByRole('button', { name: 'Adicionar item' }))
    const form = await screen.findByRole('form', { name: 'Adicionar item' })
    await user.selectOptions(within(form).getByLabelText('Tipo'), 'prayer')
    await user.type(within(form).getByLabelText('Título'), 'Oração inicial')
    await user.type(within(form).getByLabelText('Duração em minutos (opcional)'), '5')
    await user.click(within(form).getByRole('button', { name: 'Adicionar item' }))
    expect(m.addServiceItem).toHaveBeenCalledWith('sv1', { type: 'prayer', songId: undefined, title: 'Oração inicial', notes: undefined, durationMinutes: 5 })
    expect(await screen.findByRole('status')).toHaveTextContent('Item adicionado à ordem.')
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
    await openMenu(user, 'Mais ações do serviço')
    await user.click(screen.getByRole('menuitem', { name: 'Excluir serviço' }))
    expect(m.deleteService).toHaveBeenCalledWith('sv1')
  })

  it('leader cannot delete a ready service', async () => {
    const user = userEvent.setup()
    renderWith({ status: 'ready' }, leader)
    await openMenu(user, 'Mais ações do serviço')
    expect(screen.queryByRole('menuitem', { name: 'Excluir serviço' })).not.toBeInTheDocument()
  })

  it('final service hides stage start and roster, not even the owner deletes', async () => {
    renderWith({ status: 'completed' }, { organizationRole: 'owner' })
    await screen.findByRole('note')
    expect(screen.queryByRole('button', { name: 'Excluir serviço' })).not.toBeInTheDocument()
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

  it('"Iniciar palco" calls startOrResumeStage once and navigates to the session', async () => {
    vi.mocked(startOrResumeStage).mockResolvedValue({ id: 'ss1' } as never)
    renderWith({ status: 'ready' }, { organizationRole: 'owner' })
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar palco' }))
    expect(await screen.findByText('Palco aberto')).toBeInTheDocument()
    expect(startOrResumeStage).toHaveBeenCalledTimes(1)
    expect(startOrResumeStage).toHaveBeenCalledWith('sv1')
  })

  it('adds a reprise to a song item (RN-10)', async () => {
    m.addReprise.mockReset().mockResolvedValue({ success: true })
    const user = userEvent.setup()
    renderWith({}, leader)
    const menuTrigger = await screen.findByRole('button', { name: 'Mais ações de Grande é o Senhor' })
    expect(menuTrigger).toHaveAttribute('aria-haspopup', 'menu')
    await user.click(menuTrigger)
    await user.click(screen.getByRole('menuitem', { name: 'Adicionar reprise/medley a Grande é o Senhor' }))
    const form = screen.getByRole('form', { name: 'Reprise de Grande é o Senhor' })
    await user.click(within(form).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('form', { name: 'Reprise de Grande é o Senhor' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mais ações de Grande é o Senhor' }))
    await user.click(screen.getByRole('menuitem', { name: 'Adicionar reprise/medley a Grande é o Senhor' }))
    await user.selectOptions(screen.getByLabelText('Tipo'), 'medley')
    await user.click(screen.getByRole('button', { name: 'Adicionar à ordem' }))
    expect(m.addReprise).toHaveBeenCalledWith('sv1', { type: 'medley', refItemId: 'i2' })
  })

  it('shows "volta da posição N" and confirms deleting a song with reprises (RN-11)', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderWith({}, leader, [...items, { id: 'i3', serviceId: 'sv1', type: 'reprise', title: 'Reprise: Grande é o Senhor', refItemId: 'i2', position: 2, updatedAt: '' }])
    expect(await screen.findByText('volta da posição 2')).toBeTruthy()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Mais ações de Reprise: Grande é o Senhor (posição 3)' }))
    expect(screen.getByRole('menuitem', { name: 'Remover Reprise: Grande é o Senhor (posição 3)' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Mais ações de Grande é o Senhor' }))
    await user.click(screen.getByRole('menuitem', { name: 'Remover Grande é o Senhor' }))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('1 reprise/medley'))
    expect(m.removeServiceItem).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Mais ações de Grande é o Senhor' }))
    await user.click(screen.getByRole('menuitem', { name: 'Remover Grande é o Senhor' }))
    expect(m.removeServiceItem).toHaveBeenCalledWith('i2')
  })

  it('does not list a personal song twice once its Ministry copy exists', async () => {
    m.orgSongs = [{ id: 'c1', title: 'Grande é o Senhor', sourceSongId: 's1', organizationId: 'o1' }]
    renderWith({}, leader)
    await userEvent.click(await screen.findByRole('button', { name: 'Adicionar item' }))
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

  describe('layout (ADR-066)', () => {
    it('has Ordem as default tab and a back link to Serviços', async () => {
      renderWith({}, leader)
      expect(await screen.findByRole('tab', { name: 'Ordem', selected: true })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Serviços/ })).toHaveAttribute('href', '/servicos')
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Ordem', 'Escala', 'Ensaios', 'Materiais'])
    })

    it('disables Iniciar palco when the order has no song', async () => {
      renderWith({ status: 'ready' }, { organizationRole: 'owner' }, [items[0]])
      expect(await screen.findByRole('button', { name: 'Iniciar palco' })).toBeDisabled()
    })

    it('shows no "Mais ações" button to a member without permissions', async () => {
      renderWith({}, { organizationRole: 'member', teamRole: 'member', teamStatus: 'active' })
      await screen.findByText('1. Boas-vindas')
      expect(screen.queryByRole('button', { name: /Mais ações/ })).not.toBeInTheDocument()
    })

    it('shows the schedule inside the Escala tab and adds Registro when completed', async () => {
      const user = userEvent.setup()
      renderWith({ status: 'completed' }, leader)
      await user.click(await screen.findByRole('tab', { name: 'Escala' }))
      expect(screen.getByRole('region', { name: 'Escala' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Registro' })).toBeInTheDocument()
    })

    it('edits the info in a sheet', async () => {
      const user = userEvent.setup()
      m.updateServiceInfo.mockResolvedValue({ success: true })
      renderWith({}, leader)
      await openMenu(user, 'Mais ações do serviço')
      await user.click(screen.getByRole('menuitem', { name: 'Editar informações' }))
      expect(screen.getByRole('dialog', { name: 'Editar informações' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Salvar' }))
      expect(m.updateServiceInfo).toHaveBeenCalled()
      expect(await screen.findByRole('status')).toHaveTextContent('Informações salvas.')
    })

    it('shows a validation error inside the open sheet', async () => {
      const user = userEvent.setup()
      renderWith({}, leader)
      await user.click(await screen.findByRole('button', { name: 'Adicionar item' }))
      const dialog = screen.getByRole('dialog', { name: 'Adicionar item' })
      await user.selectOptions(within(dialog).getByLabelText('Tipo'), 'prayer')
      await user.type(within(dialog).getByLabelText('Título'), '   ')
      await user.click(within(dialog).getByRole('button', { name: 'Adicionar item' }))
      expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
    })
  })
})
