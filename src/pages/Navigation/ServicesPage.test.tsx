// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../../test/axe'
import { ServicesPage } from './ServicesPage'

const m = vi.hoisted(() => ({ orgs: [{ id: 'o1', name: 'Igreja' }] as unknown[], allowed: true }))
vi.mock('../../application/organizations/organizationService', () => ({ listMyOrganizations: async () => m.orgs }))
vi.mock('../../application/teams/teamService', () => ({ listTeams: async () => [{ id: 't1', organizationId: 'o1', name: 'Louvor' }] }))
vi.mock('../../application/teams/teamMemberService', () => ({
  getMyAccessContext: async () => (m.allowed ? { organizationRole: 'owner' } : { organizationRole: 'member', teamRole: 'member', teamStatus: 'active' }),
}))
vi.mock('../Schedule/MyServicesPage', () => ({ MyServicesPage: () => <p>Meus próximos serviços</p> }))
vi.mock('../../components/service/ServicesPanel', () => ({ ServicesPanel: () => <p>Lista de todos os serviços</p> }))

describe('ServicesPage', () => {
  beforeEach(() => { m.orgs = [{ id: 'o1', name: 'Igreja' }]; m.allowed = true })

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
