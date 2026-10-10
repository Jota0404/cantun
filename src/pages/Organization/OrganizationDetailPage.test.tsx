// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { OrganizationDetailPage } from './OrganizationDetailPage'

const m = vi.hoisted(() => ({ org: undefined as unknown, listeners: [] as Array<() => void> }))
vi.mock('../../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../../application/sync/remoteData', () => ({ onRemoteDataApplied: (listener: () => void) => { m.listeners.push(listener); return () => undefined } }))
vi.mock('../../db/repositories/organizationRepository', () => ({ organizationRepository: { getById: async () => m.org } }))
vi.mock('../../db/repositories/songRepository', () => ({ songRepository: { list: async () => [] } }))
vi.mock('../../db/repositories/organizationSongRepository', () => ({ organizationSongRepository: { listByOrganizationId: async () => [] } }))
vi.mock('../../db/repositories/repertoireRepository', () => ({ repertoireRepository: { listByOrganizationId: async () => [] } }))
vi.mock('../../db/repositories/teamRepository', () => ({ teamRepository: { listByOrganizationId: async () => [] } }))
vi.mock('../../components/service/ServicesPanel', () => ({ ServicesPanel: () => null }))

describe('OrganizationDetailPage', () => {
  it('shows "not found" only while missing and clears it when the organization arrives', async () => {
    render(<MemoryRouter initialEntries={['/organizations/o1']}><Routes><Route path="/organizations/:organizationId" element={<OrganizationDetailPage />} /></Routes></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Organização não encontrada.')

    m.org = { id: 'o1', name: 'Igreja Esperança', createdAt: '', updatedAt: '' }
    await act(async () => { m.listeners.forEach((listener) => listener()) })
    expect(await screen.findByText('Igreja Esperança')).toBeInTheDocument()
    expect(screen.queryByText('Organização não encontrada.')).not.toBeInTheDocument()
  })
})
