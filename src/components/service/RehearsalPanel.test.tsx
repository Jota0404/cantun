// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServiceItem } from '../../domain/services/serviceItem'
import { RehearsalPanel } from './RehearsalPanel'

const m = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), del: vi.fn() }))
vi.mock('../../application/services/rehearsalService', () => ({ listRehearsals: m.list, createRehearsal: m.create, updateRehearsal: m.update, deleteRehearsal: m.del }))
vi.mock('../../application/sync/remoteData', () => ({ onRemoteDataApplied: () => () => undefined }))

const items = [{ id: 'i1', type: 'song', songId: 'a' }, { id: 'i2', type: 'song', songId: 'b' }, { id: 'i3', type: 'prayer' }] as unknown as ServiceItem[]
const label = (i: ServiceItem) => (i.id === 'i1' ? 'Música A' : 'Música B')
const reh = { id: 'r1', serviceId: 's', startsAt: '2026-11-01T20:00:00.000Z', location: 'Sala 2', notes: 'Trazer capo', songs: [{ serviceItemId: 'i1', title: 'Música A', position: 1 }] }
const show = (final = false) => render(<RehearsalPanel serviceId="s" items={items} itemLabel={label} final={final} />)

describe('RehearsalPanel', () => {
  beforeEach(() => { Object.values(m).forEach((f) => f.mockReset()); m.list.mockResolvedValue({ success: true, rehearsals: [reh], canManage: true }) })
  afterEach(cleanup)

  it('Líder cria ensaio', async () => {
    m.list.mockResolvedValue({ success: true, rehearsals: [], canManage: true })
    m.create.mockResolvedValue({ success: true })
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar ensaio' }))
    await userEvent.type(screen.getByLabelText('Data e hora do ensaio'), '2026-11-01T19:00')
    await userEvent.type(screen.getByLabelText('Local do ensaio'), 'Sala 1')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Música B' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar ensaio' }))
    await waitFor(() => expect(m.create).toHaveBeenCalled())
    expect(m.create.mock.calls[0][0]).toBe('s')
    expect(m.create.mock.calls[0][1]).toMatchObject({ location: 'Sala 1', serviceItemIds: ['i2'] })
  })

  it('move o foco ao abrir e devolve ao fechar', async () => {
    show()
    const edit = await screen.findByRole('button', { name: /Editar ensaio/ })
    await userEvent.click(edit)
    expect(screen.getByLabelText('Data e hora do ensaio')).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(edit).toHaveFocus()
    await userEvent.click(edit)
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(edit).toHaveFocus()
  })

  it('recarrega quando os itens mudam', async () => {
    const { rerender } = show()
    await screen.findByText(/Em foco/)
    m.list.mockClear()
    rerender(<RehearsalPanel serviceId="s" items={items.slice(1)} itemLabel={label} final={false} />)
    await waitFor(() => expect(m.list).toHaveBeenCalled())
  })

  it('Líder edita e exclui', async () => {
    m.update.mockResolvedValue({ success: true })
    m.del.mockResolvedValue({ success: true })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    show()
    await userEvent.click(await screen.findByRole('button', { name: /Editar ensaio/ }))
    const local = screen.getByLabelText('Local do ensaio')
    await userEvent.clear(local)
    await userEvent.type(local, 'Igreja')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar ensaio' }))
    await waitFor(() => expect(m.update).toHaveBeenCalledWith('r1', expect.objectContaining({ location: 'Igreja', serviceItemIds: ['i1'] })))
    await userEvent.click(await screen.findByRole('button', { name: /Excluir ensaio/ }))
    await waitFor(() => expect(m.del).toHaveBeenCalledWith('r1'))
  })

  it('mostra erro do caso de uso', async () => {
    m.update.mockResolvedValue({ success: false, errors: ['Local muito longo.'] })
    show()
    await userEvent.click(await screen.findByRole('button', { name: /Editar ensaio/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar ensaio' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Local muito longo.')
  })

  it('Membro comum só vê', async () => {
    m.list.mockResolvedValue({ success: true, rehearsals: [reh], canManage: false })
    show()
    expect(await screen.findByText(/Sala 2/)).toBeTruthy()
    expect(screen.getByText(/Em foco: Música A/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('serviço final sem controles', async () => {
    show(true)
    expect(await screen.findByText(/Sala 2/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
