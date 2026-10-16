// @vitest-environment jsdom

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { OrganizationDetailPage } from './OrganizationDetailPage'

const m = vi.hoisted(() => ({ personal: [] as unknown[], org: undefined as unknown, listeners: [] as Array<() => void> }))
vi.mock('../../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../../application/sync/remoteData', () => ({ onRemoteDataApplied: (listener: () => void) => { m.listeners.push(listener); return () => undefined } }))
vi.mock('../../db/repositories/organizationRepository', () => ({ organizationRepository: { getById: async () => m.org } }))
vi.mock('../../application/songs/listSongs', () => ({ listSongs: async () => m.personal }))
vi.mock('../../application/songs/listOrganizationSongs', () => ({ listOrganizationSongs: async () => [] }))
const copySongToOrganization = vi.hoisted(() => vi.fn(async () => ({ success: true })))
vi.mock('../../application/songs/copySongToOrganization', () => ({ copySongToOrganization }))
vi.mock('../../db/repositories/repertoireRepository', () => ({ repertoireRepository: { listByOrganizationId: async () => [] } }))
const createTeam = vi.hoisted(() => vi.fn(async () => ({ id: 't1' })))
const createRepertoire = vi.hoisted(() => vi.fn(async () => ({ id: 'r1' })))
vi.mock('../../application/teams/teamService', () => ({ createTeam }))
vi.mock('../../application/repertoires/repertoireService', () => ({ createRepertoire }))
vi.mock('../../db/repositories/teamRepository', () => ({ teamRepository: { listByOrganizationId: async () => [] } }))
vi.mock('../../components/service/ServicesPanel', () => ({ ServicesPanel: () => null }))

describe('OrganizationDetailPage', () => {
  it('shows "not found" only while missing and clears it when the organization arrives', async () => {
    render(<MemoryRouter initialEntries={['/organizations/o1']}><Routes><Route path="/organizations/:organizationId" element={<OrganizationDetailPage />} /></Routes></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Ministério não encontrado')

    m.org = { id: 'o1', name: 'Igreja Esperança', createdAt: '', updatedAt: '' }
    await act(async () => { m.listeners.forEach((listener) => listener()) })
    expect(await screen.findByText('Igreja Esperança')).toBeInTheDocument()
    expect(screen.queryByText(/Ministério não encontrado/)).not.toBeInTheDocument()
  })

  it('creates a band and a repertoire through inline forms, without window.prompt', async () => {
    const user = userEvent.setup()
    const prompt = vi.spyOn(window, 'prompt')
    m.org = { id: 'o1', name: 'Igreja Esperança', createdAt: '', updatedAt: '' }
    render(<MemoryRouter initialEntries={['/organizations/o1']}><Routes><Route path="/organizations/:organizationId" element={<OrganizationDetailPage />} /></Routes></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: 'Nova banda' }))
    const teamForm = screen.getByRole('form', { name: 'Criar banda' })
    await user.type(within(teamForm).getByLabelText('Nome da banda'), 'Banda de domingo')
    await user.click(within(teamForm).getByRole('button', { name: 'Criar banda' }))
    expect(createTeam).toHaveBeenCalledWith('o1', 'Banda de domingo')

    await user.click(screen.getByRole('button', { name: 'Novo repertório' }))
    const repForm = screen.getByRole('form', { name: 'Criar repertório' })
    await user.type(within(repForm).getByLabelText('Nome do repertório'), 'Culto')
    await user.click(within(repForm).getByRole('button', { name: 'Criar repertório' }))
    expect(createRepertoire).toHaveBeenCalledWith({ organizationId: 'o1', name: 'Culto', createdByUserId: 'u1', version: 1 })
    expect(prompt).not.toHaveBeenCalled()
  })

  it('copies a song from my library to the Ministério and explains the copy', async () => {
    const user = userEvent.setup()
    m.org = { id: 'o1', name: 'Igreja Esperança', createdAt: '', updatedAt: '' }
    m.personal = [{ id: 'p1', title: 'Oceano', originalKey: 'D', currentKey: 'D', lyrics: '', isFavorite: false, createdAt: '', updatedAt: '' }]
    render(<MemoryRouter initialEntries={['/organizations/o1']}><Routes><Route path="/organizations/:organizationId" element={<OrganizationDetailPage />} /></Routes></MemoryRouter>)
    expect(await screen.findByText(/editar a cópia não muda a sua biblioteca pessoal/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Adicionar da minha biblioteca' }))
    await user.click(screen.getByRole('button', { name: 'Adicionar Oceano' }))
    expect(copySongToOrganization).toHaveBeenCalledWith('p1', 'o1')
  })
})
