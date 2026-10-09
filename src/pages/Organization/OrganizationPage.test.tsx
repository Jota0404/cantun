// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { OrganizationPage } from './OrganizationPage'

const state = vi.hoisted(() => ({ orgs: [] as Array<{ id: string; name: string }>, listeners: [] as Array<() => void> }))
vi.mock('../../db/repositories/organizationRepository', () => ({ organizationRepository: { list: async () => state.orgs } }))
vi.mock('../../db/repositories/teamRepository', () => ({ teamRepository: { listByOrganizationId: async () => [] } }))
vi.mock('../../application/sync/remoteData', () => ({ onRemoteDataApplied: (listener: () => void) => { state.listeners.push(listener); return () => undefined } }))
vi.mock('../../application/organizations/organizationService', () => ({
  createOrganization: async (name: string) => { state.orgs = [{ id: 'o1', name }]; return { id: 'o1' } },
}))
vi.mock('../../application/teams/teamService', () => ({ createTeam: async () => ({ id: 't1' }) }))
vi.mock('../../application/organizations/organizationInviteService', () => ({ createOrganizationInvite: vi.fn(), buildOrganizationInviteUrl: vi.fn() }))
vi.mock('../../application/teams/musicalFunctionService', () => ({ setMyTeamMusicalFunctions: async () => [] }))

describe('OrganizationPage onboarding', () => {
  it('keeps the wizard open through all 5 steps even after the organization appears in the list', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/organizations']}>
        <Routes>
          <Route path="/organizations" element={<OrganizationPage />} />
          <Route path="/organizations/:o/teams/:t" element={<p>Tela da equipe</p>} />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(await screen.findByLabelText('Nome da organização'), 'Igreja')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    await act(async () => { state.listeners.forEach((listener) => listener()) })

    expect(await screen.findByText('Passo 2 de 5: Equipe principal')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Nome da equipe principal'), 'Louvor')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    await act(async () => { state.listeners.forEach((listener) => listener()) })
    await user.click(await screen.findByRole('button', { name: 'Pular' }))
    expect(screen.getByText('Passo 4 de 5: Suas funções')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pular' }))
    expect(screen.getByText('Passo 5 de 5: Pronto')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Abrir equipe' }))
    expect(screen.getByText('Tela da equipe')).toBeInTheDocument()
  })
})
