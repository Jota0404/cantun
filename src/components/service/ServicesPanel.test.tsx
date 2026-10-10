// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Team } from '../../domain/teams/team'
import { ServicesPanel } from './ServicesPanel'

const svc = (id: string, name: string, status: string) => ({ id, organizationId: 'o1', teamId: 't2', name, startsAt: '2026-10-11T22:00:00.000Z', status, createdByUserId: 'u', createdAt: '', updatedAt: '' })
const createService = vi.hoisted(() => vi.fn(async () => ({ success: true })))
vi.mock('../../application/services/serviceService', () => ({
  createService,
  listServices: async () => ({ upcoming: [svc('a', 'Culto pronto', 'ready')], planning: [svc('b', 'Culto rascunho', 'draft')], past: [] }),
}))
vi.mock('../../application/sync/remoteData', () => ({ onRemoteDataApplied: () => () => undefined }))
vi.mock('../../application/teams/teamMemberService', () => ({
  getMyAccessContext: async ({ teamId }: { teamId: string }) => teamId === 't2'
    ? { organizationRole: 'member', teamRole: 'leader', teamStatus: 'active' }
    : { organizationRole: 'member', teamRole: 'member', teamStatus: 'active' },
}))

const teams: Team[] = [
  { id: 't1', organizationId: 'o1', name: 'Coral', createdAt: '', updatedAt: '' },
  { id: 't2', organizationId: 'o1', name: 'Louvor', createdAt: '', updatedAt: '' },
]

describe('ServicesPanel', () => {
  it('groups services with visible status text', async () => {
    render(<MemoryRouter><ServicesPanel organizationId="o1" teams={teams} /></MemoryRouter>)
    const upcoming = await screen.findByRole('region', { name: 'Próximos' })
    expect(within(upcoming).getByRole('link', { name: 'Culto pronto' })).toBeInTheDocument()
    expect(within(upcoming).getByText('Pronto')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Em planejamento' })).getByText('Culto rascunho')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Realizados' })).getByText(/Nenhum serviço/)).toBeInTheDocument()
  })

  it('creates a service only for teams the user leads', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ServicesPanel organizationId="o1" teams={teams} /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: 'Novo serviço' }))
    const form = screen.getByRole('form', { name: 'Novo serviço' })
    expect(within(form).getAllByRole('option').map((o) => o.textContent)).toEqual(['Louvor'])
    await user.type(within(form).getByLabelText('Nome'), 'Culto de domingo')
    await user.type(within(form).getByLabelText('Data e hora'), '2026-10-11T19:00')
    await user.click(within(form).getByRole('button', { name: 'Criar serviço' }))
    expect(createService).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'o1', teamId: 't2', name: 'Culto de domingo' }))
  })
})
