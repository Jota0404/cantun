import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { RelatedRepertoires } from './RelatedRepertoires'
import { listRepertoiresWithSong } from '../../application/services/executionHistoryService'

vi.mock('../../application/services/executionHistoryService', () => ({ listRepertoiresWithSong: vi.fn() }))

describe('RelatedRepertoires', () => {
  it('lista com links e estado vazio', async () => {
    vi.mocked(listRepertoiresWithSong).mockResolvedValueOnce([{ id: 'r1', name: 'Domingo' }])
    const { unmount } = render(<MemoryRouter><RelatedRepertoires songId="a" organizationId="o" /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: 'Domingo' })).toHaveAttribute('href', '/organizations/o/repertoires/r1')
    unmount()
    vi.mocked(listRepertoiresWithSong).mockResolvedValueOnce([])
    render(<MemoryRouter><RelatedRepertoires songId="b" organizationId="o" /></MemoryRouter>)
    expect(await screen.findByText('Nenhum repertório usa esta música.')).toBeInTheDocument()
  })
})
