// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Song } from '../../domain/songs/song'
import { axeViolations } from '../../test/axe'
import { SongPicker } from './SongPicker'

const song = (id: string, title: string, artist?: string): Song => ({ id, title, artist, originalKey: 'G', currentKey: 'G', lyrics: '', isFavorite: false, createdAt: '', updatedAt: '' })
const songs = [song('1', 'Grande é o Senhor', 'Adhemar de Campos'), song('2', 'Oceano', 'Hillsong'), song('3', 'Santo Espírito')]

describe('SongPicker', () => {
  it('searches by title and artist, ignoring case and accents', async () => {
    const user = userEvent.setup()
    render(<SongPicker songs={songs} onPick={vi.fn()} />)
    await user.type(screen.getByLabelText('Buscar música'), 'espirito')
    expect(screen.getByRole('button', { name: 'Adicionar Santo Espírito' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Adicionar Oceano' })).not.toBeInTheDocument()
    await user.clear(screen.getByLabelText('Buscar música'))
    await user.type(screen.getByLabelText('Buscar música'), 'HILLSONG')
    expect(screen.getByRole('button', { name: 'Adicionar Oceano' })).toBeInTheDocument()
  })

  it('shows all songs, not only the first few, and hides the ones already added', () => {
    const many = Array.from({ length: 12 }, (_, index) => song(`m${index}`, `Música ${index}`))
    render(<SongPicker songs={many} excludeSongIds={new Set(['m0'])} onPick={vi.fn()} />)
    expect(screen.getAllByRole('button')).toHaveLength(11)
    expect(screen.queryByRole('button', { name: 'Adicionar Música 0' })).not.toBeInTheDocument()
  })

  it('picks a song and shows the error from the action in text', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn().mockRejectedValue(new Error('A música não está mais disponível.'))
    const { container } = render(<SongPicker songs={songs} onPick={onPick} />)
    expect(await axeViolations(container)).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Adicionar Oceano' }))
    expect(onPick).toHaveBeenCalledWith(songs[1])
    expect(await screen.findByRole('alert')).toHaveTextContent('não está mais disponível')
  })

  it('explains when there is nothing to show', () => {
    render(<SongPicker songs={[]} onPick={vi.fn()} />)
    expect(screen.getByText(/ainda não tem músicas/)).toBeInTheDocument()
  })
})
