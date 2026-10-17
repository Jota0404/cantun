// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../../test/axe'
import { ServicesPage } from './ServicesPage'

const m = vi.hoisted(() => ({ orgs: [{ id: 'o1', name: 'Igreja' }] as unknown[], allowed: true, fail: false, remote: undefined as undefined | (() => void) }))
vi.mock('../../application/organizations/organizationService', () => ({ listMyOrganizations: async () => { if (m.fail) throw new Error('x'); return m.orgs } }))
vi.mock('../../application/sync/remoteData', () => ({ onRemoteDataApplied: (cb: () => void) => { m.remote = cb; return () => undefined } }))
vi.mock('../../application/teams/teamService', () => ({ listTeams: async () => [{ id: 't1', organizationId: 'o1', name: 'Louvor' }] }))
vi.mock('../../application/teams/teamMemberService', () => ({
  getMyAccessContext: async () => (m.allowed ? { organizationRole: 'owner' } : { organizationRole: 'member', teamRole: 'member', teamStatus: 'active' }),
}))
vi.mock('../Schedule/MyServicesPage', () => ({ MyServicesPage: () => <p>Meus próximos serviços</p> }))
vi.mock('../../components/service/ServicesPanel', () => ({ ServicesPanel: () => <p>Lista de todos os serviços</p> }))

describe('ServicesPage', () => {
  beforeEach(() => { m.orgs = [{ id: 'o1', name: 'Igreja' }]; m.allowed = true; m.fail = false; m.remote = undefined })

  it('shows an error, not the empty-organization message, when loading fails', async () => {
    m.fail = true
    render(<MemoryRouter><ServicesPage tab="mine" /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar.')
    expect(screen.queryByText(/ainda não participa/)).not.toBeInTheDocument()
  })

  it('reloads after the remote pull so a fresh device gets the tabs', async () => {
    m.orgs = []
    render(<MemoryRouter><ServicesPage tab="mine" /></MemoryRouter>)
    expect(await screen.findByText(/ainda não participa/)).toBeInTheDocument()
    m.orgs = [{ id: 'o1', name: 'Igreja' }]
    act(() => m.remote?.())
    expect(await screen.findByRole('navigation', { name: 'Seções de serviços' })).toBeInTheDocument()
  })

  it('managers see both tabs and open "Todos os serviços"', async () => {
    render(<MemoryRouter initialEntries={['/servicos/todos']}><ServicesPage tab="all" /></MemoryRouter>)
    expect(await screen.findByText('Lista de todos os serviços')).toBeInTheDocument()
    const tabs = screen.getByRole('navigation', { name: 'Seções de serviços' })
    expect(tabs).toHaveTextContent('Meus serviços')
    expect(screen.getByRole('link', { name: 'Todos os serviços' })).toHaveAttribute('aria-current', 'page')
  })

  it('/meus-servicos opens the "Meus serviços" tab', async () => {
    render(<MemoryRouter initialEntries={['/meus-servicos']}><ServicesPage tab="mine" /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: 'Meus serviços' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Meus próximos serviços')).toBeInTheDocument()
  })

  it('without service.create there is only "Meus serviços", even on the other URL', async () => {
    m.allowed = false
    const { container } = render(<MemoryRouter><ServicesPage tab="all" /></MemoryRouter>)
    expect(await screen.findByText('Meus próximos serviços')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Seções de serviços' })).not.toBeInTheDocument()
    expect(screen.queryByText('Lista de todos os serviços')).not.toBeInTheDocument()
    expect(await axeViolations(container)).toEqual([])
  })
})
