import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../../test/axe'

const m = vi.hoisted(() => ({ apply: vi.fn() }))
vi.mock('../../application/services/applyRepertoire', () => ({
  listApplicableRepertoires: async () => [{ id: 'r1', name: 'Domingo' }],
  applyRepertoireToService: m.apply,
}))
vi.mock('../../application/repertoires/repertoireService', () => ({
  getRepertoireDetail: async () => ({ repertoire: { id: 'r1' }, items: [
    { songId: 'a', song: { title: 'Oceano' } }, { songId: 'b', song: { title: 'Aliança' } }, { songId: 'c', song: { title: 'Santo' } }, { songId: 'd' },
  ] }),
}))

import { ApplyRepertoireDialog } from './ApplyRepertoireDialog'

const items = [{ id: 'i0', serviceId: 's1', type: 'song' as const, songId: 'b', position: 0, updatedAt: '' }]

async function open() {
  const user = userEvent.setup()
  const onApplied = vi.fn()
  const view = render(<ApplyRepertoireDialog serviceId="s1" items={items} itemLabel={() => 'Aliança'} onClose={vi.fn()} onApplied={onApplied} />)
  await user.selectOptions(await screen.findByLabelText('Repertório'), 'r1')
  return { user, onApplied, view }
}

describe('ApplyRepertoireDialog', () => {
  beforeEach(() => m.apply.mockReset().mockResolvedValue({ success: true }))

  it('disables songs already in the order, applies the checked ones in the chosen order', async () => {
    const { user, onApplied, view } = await open()
    expect(screen.getByRole('checkbox', { name: /Aliança/ })).toBeDisabled()
    expect(screen.getByText(/já está na ordem/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Descer Oceano' }))
    await user.click(screen.getByRole('checkbox', { name: /Santo/ }))
    await user.selectOptions(screen.getByLabelText('Inserir'), 'i0')
    expect(await axeViolations(view.container)).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(onApplied).toHaveBeenCalled())
    expect(m.apply).toHaveBeenCalledWith('s1', { repertoireId: 'r1', songIds: ['a'], afterItemId: 'i0' })
  })

  it('disables songs missing on this device', async () => {
    await open()
    expect(screen.getByRole('checkbox', { name: /Música indisponível/ })).toBeDisabled()
  })

  it('shows the error and stays open when applying fails', async () => {
    m.apply.mockResolvedValue({ success: false, errors: ['Sem permissão.'] })
    const { user, onApplied } = await open()
    await user.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem permissão.')
    expect(onApplied).not.toHaveBeenCalled()
  })
})
