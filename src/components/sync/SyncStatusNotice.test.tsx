import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncStatusNotice } from './SyncStatusNotice'

const sync = vi.hoisted(() => ({ getSyncStatus: vi.fn(), discardRejectedChanges: vi.fn() }))
vi.mock('../../application/sync/syncStatus', () => sync)

describe('SyncStatusNotice', () => {
  beforeEach(() => { vi.resetAllMocks() })

  it('renders nothing when everything was sent', async () => {
    sync.getSyncStatus.mockResolvedValue({ pending: 0, failed: [] })
    const { container } = render(<SyncStatusNotice />)
    await Promise.resolve()
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the pending count', async () => {
    sync.getSyncStatus.mockResolvedValue({ pending: 3, failed: [] })
    render(<SyncStatusNotice />)
    expect(await screen.findByRole('status')).toHaveTextContent('3 alteração(ões) aguardando envio')
  })

  it('discards rejected changes only after confirmation', async () => {
    const user = userEvent.setup()
    sync.getSyncStatus.mockResolvedValueOnce({ pending: 0, failed: [{ id: 1, entity: 'teams', reason: 'forbidden' }] }).mockResolvedValue({ pending: 0, failed: [] })
    render(<SyncStatusNotice />)
    expect(await screen.findByRole('alert')).toHaveTextContent('1 alteração(ões) foram recusadas')

    await user.click(screen.getByRole('button', { name: 'Descartar alterações recusadas' }))
    expect(sync.discardRejectedChanges).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Descartar' }))

    expect(sync.discardRejectedChanges).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})
