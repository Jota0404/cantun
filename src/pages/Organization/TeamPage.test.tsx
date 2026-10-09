// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccessContext } from '../../domain/access/permissions'
import type { TeamMemberView } from '../../application/teams/teamMemberService'
import { TeamPage } from './TeamPage'

const service = vi.hoisted(() => ({
  getMyAccessContext: vi.fn(),
  listTeamMembers: vi.fn(),
  promoteToLeader: vi.fn(),
  demoteToMember: vi.fn(),
  setMemberStatus: vi.fn(),
  setMemberFunctions: vi.fn(),
  setMyDisplayName: vi.fn(),
}))
vi.mock('../../application/teams/teamMemberService', () => service)
vi.mock('../../application/sync/remoteData', () => ({ onRemoteDataApplied: () => () => undefined }))
vi.mock('../../application/teams/teamService', () => ({ updateTeam: vi.fn() }))
vi.mock('../../application/organizations/organizationInviteService', () => ({ createOrganizationInvite: vi.fn(), buildOrganizationInviteUrl: vi.fn(), revokeOrganizationInvite: vi.fn() }))
vi.mock('../../db/repositories/teamRepository', () => ({ teamRepository: { getById: async () => ({ id: 't1', organizationId: 'o1', name: 'Louvor', createdAt: '', updatedAt: '' }) } }))
vi.mock('../../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'me', email: 'me@example.com', emailVerified: true, displayName: 'Eu' }, refresh: vi.fn() }) }))

const members: TeamMemberView[] = [
  { membershipId: 'm1', userId: 'me', displayName: 'Eu', role: 'leader', displayStatus: 'active', musicalFunctions: ['vocals'] },
  { membershipId: 'm2', userId: 'u2', displayName: 'Ana', role: 'member', displayStatus: 'active', musicalFunctions: ['drums'] },
  { membershipId: 'm3', userId: 'u3', displayName: 'Bruno', role: 'member', displayStatus: 'inactive', musicalFunctions: ['bass'] },
  { inviteId: 'i1', displayName: 'Convite pendente', role: 'member', displayStatus: 'pending_invite', musicalFunctions: [] },
]

function renderAs(access: AccessContext) {
  service.getMyAccessContext.mockResolvedValue(access)
  render(
    <MemoryRouter initialEntries={['/organizations/o1/teams/t1']}>
      <Routes><Route path="/organizations/:organizationId/teams/:teamId" element={<TeamPage />} /></Routes>
    </MemoryRouter>,
  )
}

const leader: AccessContext = { organizationRole: 'member', teamRole: 'leader', teamStatus: 'active', isActiveLeaderInOrganization: true }
const owner: AccessContext = { organizationRole: 'owner' }
const member: AccessContext = { organizationRole: 'member', teamRole: 'member', teamStatus: 'active' }

describe('TeamPage', () => {
  beforeEach(() => {
    Object.values(service).forEach((fn) => fn.mockReset())
    service.listTeamMembers.mockResolvedValue(members)
  })

  it('shows names, roles, functions and status, never e-mail or user id', async () => {
    renderAs(member)
    expect(await screen.findByText('Eu (você)')).toBeInTheDocument()
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('Membro · Inativo')).toBeInTheDocument()
    expect(screen.getByText('Membro · Convite pendente')).toBeInTheDocument()
    expect(screen.getByText('Funções: Bateria')).toBeInTheDocument()
    expect(screen.queryByText(/me@example.com|u2/)).not.toBeInTheDocument()
  })

  it('highlights functions without anyone active', async () => {
    renderAs(member)
    const section = await screen.findByRole('region', { name: 'Funções sem ninguém' })
    expect(within(section).getByText('Baixo')).toBeInTheDocument()
    expect(within(section).queryByText('Voz')).not.toBeInTheDocument()
  })

  it('filters by status and function', async () => {
    const user = userEvent.setup()
    renderAs(member)
    await screen.findByText('Ana')
    await user.selectOptions(screen.getByLabelText('Status'), 'inactive')
    expect(screen.queryByText('Ana')).not.toBeInTheDocument()
    expect(screen.getByText('Bruno')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Status'), 'all')
    await user.selectOptions(screen.getByLabelText('Função'), 'drums')
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.queryByText('Bruno')).not.toBeInTheDocument()
  })

  it('member only edits own functions', async () => {
    renderAs(member)
    await screen.findByText('Ana')
    expect(screen.getByRole('button', { name: 'Editar funções de Eu' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar funções de Ana' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Inativar|Promover/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Convidar para esta equipe' })).not.toBeInTheDocument()
  })

  it('leader manages members but not roles; inactive member is not editable', async () => {
    renderAs(leader)
    await screen.findByText('Ana')
    expect(screen.getByRole('button', { name: 'Inativar Ana' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reativar Bruno' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar funções de Ana' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar funções de Bruno' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Promover/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Revogar convite' })).toBeInTheDocument()
  })

  it('owner promotes; an error keeps the screen and shows the message', async () => {
    const user = userEvent.setup()
    service.promoteToLeader.mockResolvedValue({ success: false, errors: ['Sem conexão.'] })
    renderAs(owner)
    await user.click(await screen.findByRole('button', { name: 'Promover a Líder de Ana' }))
    expect(service.promoteToLeader).toHaveBeenCalledWith('m2')
    expect(screen.getByRole('alert')).toHaveTextContent('Sem conexão.')
    expect(service.listTeamMembers).toHaveBeenCalledTimes(1)
  })

  it('saves functions through the use case', async () => {
    const user = userEvent.setup()
    service.setMemberFunctions.mockResolvedValue({ success: true, musicalFunctions: ['drums', 'keys'] })
    renderAs(leader)
    await user.click(await screen.findByRole('button', { name: 'Editar funções de Ana' }))
    await user.click(within(screen.getByRole('group', { name: 'Funções de Ana' })).getByLabelText('Teclado'))
    expect(service.setMemberFunctions).toHaveBeenCalledWith({ teamId: 't1', userId: 'u2', musicalFunctions: ['drums', 'keys'] })
  })
})
