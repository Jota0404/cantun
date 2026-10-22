// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MaterialsPanel } from './MaterialsPanel'

vi.mock('../../application/sync/remoteData', () => ({ onRemoteDataApplied: () => () => undefined }))
const m = vi.hoisted(() => ({ list: vi.fn(), add: vi.fn(), update: vi.fn(), del: vi.fn() }))
vi.mock('../../application/services/materialService', () => ({ listMaterials: m.list, addMaterial: m.add, updateMaterial: m.update, deleteMaterial: m.del }))

const mat = { id: 'm1', ownerType: 'service', ownerId: 's1', title: 'Cifra', url: 'https://example.com/a', domain: 'example.com', notes: 'Tom D' }
const owner = { type: 'service', id: 's1' } as const
const list = (canManage: boolean) => m.list.mockResolvedValue({ success: true, materials: [mat], canManage })

describe('MaterialsPanel', () => {
  beforeEach(() => { Object.values(m).forEach((f) => f.mockReset()) })
  afterEach(cleanup)

  it('Membro só vê links seguros com domínio', async () => {
    list(false)
    render(<MaterialsPanel owner={owner} title="Materiais do serviço" />)
    const link = await screen.findByRole('link', { name: /^Cifra/ })
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.getByText(/example\.com/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('link inválido não é clicável e o aviso aparece para leitor', async () => {
    m.list.mockResolvedValue({ success: true, materials: [{ ...mat, url: 'nope', domain: '' }], canManage: false })
    render(<MaterialsPanel owner={owner} />)
    expect(await screen.findByText(/link inválido/)).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText('()')).toBeNull()
    expect(screen.getByText(/não guarda o arquivo/)).toBeTruthy()
  })

  it('serviço final não tem controles', async () => {
    list(true)
    render(<MaterialsPanel owner={owner} final />)
    await screen.findByRole('link', { name: /^Cifra/ })
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('Líder adiciona', async () => {
    list(true)
    m.add.mockResolvedValue({ success: true, material: mat })
    render(<MaterialsPanel owner={owner} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar link' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Título do link')))
    fireEvent.change(screen.getByLabelText('Título do link'), { target: { value: 'Letra' } })
    fireEvent.change(screen.getByLabelText('Endereço (URL)'), { target: { value: 'https://x.org/l' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar link' }))
    await waitFor(() => expect(m.add).toHaveBeenCalledWith(owner, { title: 'Letra', url: 'https://x.org/l', notes: undefined }))
  })

  it('URL recusada mostra alerta', async () => {
    list(true)
    m.add.mockResolvedValue({ success: false, errors: ['Use um endereço https.'] })
    render(<MaterialsPanel owner={owner} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar link' }))
    fireEvent.change(screen.getByLabelText('Título do link'), { target: { value: 'X' } })
    fireEvent.change(screen.getByLabelText('Endereço (URL)'), { target: { value: 'http://x.org' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar link' }))
    expect((await screen.findByRole('alert')).textContent).toContain('https')
  })

  it('Líder edita e exclui', async () => {
    list(true)
    m.update.mockResolvedValue({ success: true, material: mat })
    m.del.mockResolvedValue({ success: true })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<MaterialsPanel owner={owner} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Editar link Cifra' }))
    fireEvent.change(screen.getByLabelText('Título do link'), { target: { value: 'Cifra 2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar link' }))
    await waitFor(() => expect(m.update).toHaveBeenCalledWith('m1', expect.objectContaining({ title: 'Cifra 2' })))
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir link Cifra' }))
    await waitFor(() => expect(m.del).toHaveBeenCalledWith('m1'))
  })
})
