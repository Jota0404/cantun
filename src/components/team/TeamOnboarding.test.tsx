// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { TeamOnboarding } from './TeamOnboarding'

const createOrganization = vi.fn(async () => ({ id: 'o1' }))
const createTeam = vi.fn(async () => ({ id: 't1' }))
const setMyTeamMusicalFunctions = vi.fn(async () => ['vocals'])
vi.mock('../../application/organizations/organizationService', () => ({ createOrganization: () => createOrganization() }))
vi.mock('../../application/teams/teamService', () => ({ createTeam: (...args: unknown[]) => createTeam(...(args as [])) }))
vi.mock('../../application/organizations/organizationInviteService', () => ({ createOrganizationInvite: vi.fn(), buildOrganizationInviteUrl: vi.fn() }))
vi.mock('../../application/teams/musicalFunctionService', () => ({ setMyTeamMusicalFunctions: (...args: unknown[]) => setMyTeamMusicalFunctions(...(args as [])) }))

describe('TeamOnboarding', () => {
  it('guides a new user to a ready team in 5 steps', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<TeamOnboarding />} />
          <Route path="/organizations/:o/teams/:t" element={<p>Tela da equipe</p>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Passo 1 de 5: Organização')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Nome da organização'), 'Igreja')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    await user.type(await screen.findByLabelText('Nome da equipe principal'), 'Louvor')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(createTeam).toHaveBeenCalledWith('o1', 'Louvor')
    await user.click(await screen.findByRole('button', { name: 'Pular' }))
    await user.click(screen.getByLabelText('Voz'))
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(setMyTeamMusicalFunctions).toHaveBeenCalledWith('t1', ['vocals'])
    expect(await screen.findByText('Passo 5 de 5: Pronto')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Abrir equipe' }))
    expect(screen.getByText('Tela da equipe')).toBeInTheDocument()
  })
})
