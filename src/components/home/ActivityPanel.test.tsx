// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ActivityPanel } from './ActivityPanel'

const mocks = vi.hoisted(() => ({ orgs: [{ id: 'o1' }] as { id: string }[], result: {} as unknown }))
vi.mock('../../application/organizations/organizationService', () => ({ listMyOrganizations: async () => mocks.orgs }))
vi.mock('../../application/sync/remoteData', () => ({ onRemoteDataApplied: () => () => undefined }))
vi.mock('../../application/services/activityService', () => ({ getRecentActivity: async () => mocks.result }))

const renderPanel = () => render(<MemoryRouter><ActivityPanel /></MemoryRouter>)

describe('ActivityPanel', () => {
  beforeEach(() => { mocks.orgs = [{ id: 'o1' }] })

  it('lists events read-only, linking to the service, with no controls', async () => {
    mocks.result = { success: true, events: [
      { id: 'e1', kind: 'x', text: 'Culto foi confirmado', serviceId: 's1', createdAt: '2026-10-20T10:00:00.000Z' },
      { id: 'e2', kind: 'x', text: 'Membro entrou', serviceId: null, createdAt: '2026-10-19T10:00:00.000Z' },
    ] }
    renderPanel()
    const region = await screen.findByRole('region', { name: 'Atividade' })
    expect(await within(region).findByRole('link', { name: 'Culto foi confirmado' })).toHaveAttribute('href', '/services/s1')
    expect(within(region).getByText('Membro entrou')).toBeInTheDocument()
    expect(within(region).getAllByRole('listitem')).toHaveLength(2)
    expect(within(region).queryByRole('button')).toBeNull()
    expect(within(region).queryByRole('textbox')).toBeNull()
  })

  it('shows loading, then the empty state', async () => {
    mocks.result = { success: true, events: [] }
    renderPanel()
    expect(screen.getByRole('status')).toHaveTextContent('Carregando')
    expect(await screen.findByText('Sem atividade recente.')).toBeInTheDocument()
  })

  it('shows a generic pt-BR message, never the raw server error', async () => {
    mocks.result = { success: false, errors: ['Rate limit exceeded, retry in 3 seconds'] }
    renderPanel()
    expect(await screen.findByText('Não foi possível carregar a atividade. Tente de novo em instantes.')).toBeInTheDocument()
    expect(screen.queryByText(/Rate limit/)).not.toBeInTheDocument()
  })
})
