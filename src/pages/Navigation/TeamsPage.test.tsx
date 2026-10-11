// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../../test/axe'
import { TeamsPage } from './TeamsPage'

const m = vi.hoisted(() => ({ orgs: [] as unknown[] }))
vi.mock('../../application/organizations/organizationService', () => ({ listMyOrganizations: async () => m.orgs }))
vi.mock('../../application/sync/remoteData', () => ({ onRemoteDataApplied: () => () => undefined }))
vi.mock('../../db/repositories/teamRepository', () => ({ teamRepository: { listByOrganizationId: async () => [{ id: 't1', organizationId: 'o1', name: 'Louvor' }] } }))
vi.mock('../../components/team/TeamOnboarding', () => ({ TeamOnboarding: () => <p>Vamos preparar sua banda</p> }))

describe('TeamsPage', () => {
  beforeEach(() => { m.orgs = [] })

  it('lists the teams of the main organization with links', async () => {
    m.orgs = [{ id: 'o1', name: 'Igreja Esperança' }]
    const { container } = render(<MemoryRouter><TeamsPage /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: 'Louvor' })).toHaveAttribute('href', '/organizations/o1/teams/t1')
    expect(screen.getByText('Igreja Esperança')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir o Ministério' })).toHaveAttribute('href', '/organizations/o1')
    expect(await axeViolations(container)).toEqual([])
  })

  it('shows the onboarding when there is no organization yet', async () => {
    render(<MemoryRouter><TeamsPage /></MemoryRouter>)
    expect(await screen.findByText('Vamos preparar sua banda')).toBeInTheDocument()
  })
})
