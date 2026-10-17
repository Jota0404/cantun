// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ImportPersonalRepertoire } from './ImportPersonalRepertoire'
import { summarySongs } from './summarySongs'

const m = vi.hoisted(() => ({ importPersonalRepertoire: vi.fn(), list: vi.fn() }))
vi.mock('../../application/repertoires/repertoireService', () => ({ importPersonalRepertoire: m.importPersonalRepertoire, listPersonalRepertoires: m.list }))

const entry = { repertoire: { id: 'p1', name: 'Domingo' }, songTitles: ['Oceano', 'Aliança', 'Santo'], moreCount: 2 }

describe('ImportPersonalRepertoire (RN-C2)', () => {
  beforeEach(() => { vi.resetAllMocks(); m.list.mockResolvedValue([entry]) })

  it('summarises up to 3 song names plus "+N"', () => {
    expect(summarySongs(entry as never)).toBe('Oceano, Aliança, Santo +2')
    expect(summarySongs({ ...entry, songTitles: ['Um'], moreCount: 0 } as never)).toBe('Um')
    expect(summarySongs({ ...entry, songTitles: [], moreCount: 0 } as never)).toBe('Sem músicas')
  })

  it('imports the chosen repertoire, reports the counts and tells the page to reload', async () => {
    const user = userEvent.setup()
    const onImported = vi.fn()
    m.importPersonalRepertoire.mockResolvedValue({ success: true, repertoire: { name: 'Domingo' }, copied: 2, reused: 1 })
    render(<ImportPersonalRepertoire organizationId="o1" userId="u1" onImported={onImported} />)
    expect(await screen.findByText('Oceano, Aliança, Santo +2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Importar Domingo' }))

    expect(m.importPersonalRepertoire).toHaveBeenCalledWith('p1', 'o1')
    expect(await screen.findByRole('status')).toHaveTextContent('2 música(s) copiada(s), 1 já estavam')
    expect(onImported).toHaveBeenCalled()
  })

  it('shows the error in text (offline or refused) and does not reload', async () => {
    const user = userEvent.setup()
    const onImported = vi.fn()
    m.importPersonalRepertoire.mockResolvedValue({ success: false, errors: ['Sem conexão: tente de novo quando estiver online.'] })
    render(<ImportPersonalRepertoire organizationId="o1" userId="u1" onImported={onImported} />)
    await user.click(await screen.findByRole('button', { name: 'Importar Domingo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão')
    expect(onImported).not.toHaveBeenCalled()
  })

  it('says when there is nothing to import', async () => {
    m.list.mockResolvedValue([])
    render(<ImportPersonalRepertoire organizationId="o1" userId="u1" onImported={vi.fn()} />)
    expect(await screen.findByText(/não tem repertórios pessoais/)).toBeInTheDocument()
  })
})
