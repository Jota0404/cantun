// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Song } from '../../domain/songs/song'
import { EditSongPage } from './EditSongPage'

vi.mock('../../application/songs/getSongById', () => ({
  getSongById: vi.fn().mockResolvedValue({ id: 'song-1' }),
}))

vi.mock('../../components/song/SongForm', () => ({
  SongForm: ({ onSuccess }: { onSuccess: (song: Song) => void }) => (
    <button
      type="button"
      onClick={() => onSuccess({ id: 'song-1' } as Song)}
    >
      Salvar teste
    </button>
  ),
}))

describe('EditSongPage navigation', () => {
  it('returns to the song detail after a successful update', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/songs/song-1/edit']}>
        <Routes>
          <Route path="/songs/:songId/edit" element={<EditSongPage />} />
          <Route path="/songs/:songId" element={<p>Detalhe atualizado</p>} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: 'Salvar teste' }))

    expect(screen.getByText('Detalhe atualizado')).toBeInTheDocument()
  })
})
