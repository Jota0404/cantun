import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CompletedServicesPanel } from './CompletedServicesPanel'
import { listServices } from '../../application/services/serviceService'

vi.mock('../../application/services/serviceService', () => ({ listServices: vi.fn() }))

describe('CompletedServicesPanel', () => {
  it('lista só concluídos com link', async () => {
    const base = { organizationId: 'o', teamId: 't', startsAt: '2026-10-04T13:00:00Z' }
    vi.mocked(listServices).mockResolvedValue({ upcoming: [], planning: [], past: [
      { ...base, id: 's1', name: 'Culto A', status: 'completed' }, { ...base, id: 's2', name: 'Culto B', status: 'cancelled' },
    ] } as never)
    render(<MemoryRouter><CompletedServicesPanel organizationId="o" /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: 'Culto A' })).toHaveAttribute('href', '/services/s1')
    expect(screen.queryByRole('link', { name: 'Culto B' })).not.toBeInTheDocument()
  })
})
