// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../../test/axe'
import { TeamsPage } from './TeamsPage'

const m = vi.hoisted(() => ({ orgs: [] as unknown[], fail: false, reload: () => {} }))
vi.mock('../../application/organizations/organizationService', () => ({ listMyOrganizations: async () => { if (m.fail) throw new Error('x'); return m.orgs } }))
vi.mock('../../application/sync/remoteData', () => ({ onRemoteDataApplied: (callback: () => void) => { m.reload = callback; return () => undefined } }))
vi.mock('../../application/teams/teamService', () => ({ listTeams: async () => [{ id: 't1', organizationId: 'o1', name: 'Louvor' }] }))
vi.mock('../../components/team/TeamOnboarding', () => ({ TeamOnboarding: () => <p>Vamos preparar sua banda</p> }))

describe('TeamsPage', () => {
  beforeEach(() => { m.orgs = []; m.fail = false })

  it('lists the teams of the main organization with links', async () => {
    m.orgs = [{ id: 'o1', name: 'Igreja Esperança' }]
    const { container } = render(<MemoryRouter><TeamsPage /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: 'Louvor' })).toHaveAttribute('href', '/organizations/o1/teams/t1')
    expect(screen.getByText('Igreja Esperança')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir o Ministério' })).toHaveAttribute('href', '/organizations/o1')
    expect(await axeViolations(container)).toEqual([])
  })

  it('shows an error, not the onboarding, when loading fails', async () => {
    m.fail = true
    render(<MemoryRouter><TeamsPage /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar.')
    expect(screen.queryByText('Vamos preparar sua banda')).not.toBeInTheDocument()
  })

  it('shows the onboarding when there is no organization yet', async () => {
    render(<MemoryRouter><TeamsPage /></MemoryRouter>)
    expect(await screen.findByText('Vamos preparar sua banda')).toBeInTheDocument()
  })

  it('keeps the onboarding after the organization is created in step 1', async () => {
    render(<MemoryRouter><TeamsPage /></MemoryRouter>)
    expect(await screen.findByText('Vamos preparar sua banda')).toBeInTheDocument()
    m.orgs = [{ id: 'o1', name: 'Igreja Esperança' }]
    await act(async () => { m.reload() })
    expect(screen.getByText('Vamos preparar sua banda')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Louvor' })).not.toBeInTheDocument()
  })
})
