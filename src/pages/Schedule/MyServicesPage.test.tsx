// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MyServicesPage } from './MyServicesPage'

const m = vi.hoisted(() => ({
  mine: [] as unknown[], done: [] as unknown[], days: [] as unknown[], orgs: [{ id: 'o1', name: 'Igreja Esperança' }] as unknown[],
  confirmAssignment: vi.fn(), declineAssignment: vi.fn(), requestReplacement: vi.fn(), setMyAvailability: vi.fn(), clearMyAvailability: vi.fn(),
}))
vi.mock('../../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('../../application/sync/remoteData', () => ({ onRemoteDataApplied: () => () => undefined }))
vi.mock('../../application/organizations/organizationService', () => ({ listMyOrganizations: async () => m.orgs }))
vi.mock('../../application/services/scheduleService', () => ({
  listMyUpcomingAssignments: async () => m.mine, listMyAvailability: async () => m.days, listMyCompletedServices: async () => m.done,
  confirmAssignment: m.confirmAssignment, declineAssignment: m.declineAssignment, requestReplacement: m.requestReplacement,
  setMyAvailability: m.setMyAvailability, clearMyAvailability: m.clearMyAvailability,
}))

const item = (status: string) => ({
  assignment: { id: 'a1', serviceId: 'sv1', positionId: 'p1', userId: 'me', musicalFunction: 'drums', status, createdAt: '', updatedAt: '' },
  service: { id: 'sv1', organizationId: 'o1', name: 'Culto de domingo', startsAt: '2026-10-11T22:00:00.000Z', location: 'Templo' },
  songTitles: ['Grande é o Senhor'],
})

describe('MyServicesPage', () => {
  beforeEach(() => {
    Object.values(m).forEach((value) => { if (typeof value === 'function' && 'mockReset' in value) value.mockReset().mockResolvedValue({ success: true }) })
    m.days = []; m.done = []
  })

  it('lists completed services with link, date and function', async () => {
    m.done = [{ serviceId: 'sv9', serviceName: 'Culto de Páscoa', startsAt: '2026-04-05T13:00:00.000Z', musicalFunction: 'drums', organizationId: 'o1' }]
    render(<MemoryRouter><MyServicesPage /></MemoryRouter>)
    const card = await screen.findByRole('listitem', { name: 'Culto de Páscoa (realizado)' })
    expect(within(card).getByRole('link', { name: 'Culto de Páscoa' })).toHaveAttribute('href', '/services/sv9')
    expect(within(card).getByText('Bateria')).toBeInTheDocument()
  })

  it('shows empty state for completed services', async () => {
    render(<MemoryRouter><MyServicesPage /></MemoryRouter>)
    expect(await screen.findByText('Você ainda não participou de serviços concluídos.')).toBeInTheDocument()
  })

  it('lists my services with function, status and songs, and confirms an invite', async () => {
    const user = userEvent.setup()
    m.mine = [item('invited')]
    render(<MemoryRouter><MyServicesPage /></MemoryRouter>)
    const card = await screen.findByRole('listitem', { name: 'Culto de domingo' })
    expect(within(card).getByText('Bateria')).toBeInTheDocument()
    expect(within(card).getByText(/Convidado, aguardando resposta/)).toBeInTheDocument()
    expect(within(card).getByText(/Grande é o Senhor/)).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: /Recusar/ }))
    expect(m.declineAssignment).toHaveBeenCalledWith('a1')
    await user.click(within(card).getByRole('button', { name: /Confirmar/ }))
    expect(m.confirmAssignment).toHaveBeenCalledWith('a1')
  })

  it('confirmed assignment offers replacement request', async () => {
    const user = userEvent.setup()
    m.mine = [item('confirmed')]
    render(<MemoryRouter><MyServicesPage /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: /Pedir substituição/ }))
    expect(m.requestReplacement).toHaveBeenCalledWith('a1')
  })

  it('saves availability per date without needing a connection', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    m.mine = [item('confirmed')]
    render(<MemoryRouter><MyServicesPage /></MemoryRouter>)
    const form = await screen.findByRole('form', { name: 'Informar disponibilidade' })
    await user.type(within(form).getByLabelText('Data'), '2026-10-18')
    await user.selectOptions(within(form).getByLabelText('Situação'), 'tentative')
    await user.click(within(form).getByRole('button', { name: 'Salvar disponibilidade' }))
    expect(m.setMyAvailability).toHaveBeenCalledWith({ organizationId: 'o1', date: '2026-10-18', status: 'tentative', note: undefined })
  })

  it('shows an empty state', async () => {
    m.mine = []
    render(<MemoryRouter><MyServicesPage /></MemoryRouter>)
    expect(await screen.findByText('Você não está escalado em nenhum serviço próximo.')).toBeInTheDocument()
  })

  it('lets someone not yet scheduled inform availability, choosing the organization', async () => {
    const user = userEvent.setup()
    m.mine = []
    m.orgs = [{ id: 'o1', name: 'Igreja Esperança' }, { id: 'o2', name: 'Casa de Oração' }]
    render(<MemoryRouter><MyServicesPage /></MemoryRouter>)
    const form = await screen.findByRole('form', { name: 'Informar disponibilidade' })
    await user.selectOptions(within(form).getByLabelText('Ministério'), 'o2')
    await user.type(within(form).getByLabelText('Data'), '2026-10-25')
    await user.click(within(form).getByRole('button', { name: 'Salvar disponibilidade' }))
    expect(m.setMyAvailability).toHaveBeenCalledWith({ organizationId: 'o2', date: '2026-10-25', status: 'unavailable', note: undefined })
    m.orgs = [{ id: 'o1', name: 'Igreja Esperança' }]
  })
})
