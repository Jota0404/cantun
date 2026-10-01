// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Song } from '../../domain/songs/song'
import { db } from '../../db/database'
import { SongForm } from '../../components/song/SongForm'

afterEach(async () => {
  cleanup()
  await db.songs.clear()
})

describe('SongForm', () => {
  it('shows validation errors and does not create a song when required fields are missing', async () => {
    const user = userEvent.setup()

    render(<SongForm />)

    await user.click(
      screen.getByRole('button', { name: /salvar música/i }),
    )

    expect(
      await screen.findByText('Título é obrigatório.'),
    ).toBeInTheDocument()

    expect(
      screen.getByText('Tom original é obrigatório.'),
    ).toBeInTheDocument()

    expect(
      screen.getByText('Tom atual é obrigatório.'),
    ).toBeInTheDocument()

    expect(
      screen.getByText('Cifra/letra é obrigatória.'),
    ).toBeInTheDocument()

    expect(await db.songs.count()).toBe(0)
  })

  it('creates a song and shows a confirmation when the form is valid', async () => {
    const user = userEvent.setup()

    render(<SongForm />)

    await user.type(
      screen.getByLabelText('Título'),
      'Grandioso És Tu',
    )

    await user.selectOptions(
      screen.getByLabelText('Tom original'),
      'D',
    )

    await user.selectOptions(
      screen.getByLabelText('Tom atual'),
      'D',
    )

    await user.type(
      screen.getByLabelText('Cifra/letra'),
      'D    G    D\nComo és grandioso',
    )

    await user.click(
      screen.getByRole('button', { name: /salvar música/i }),
    )

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'cadastrada com sucesso',
      )
    })

    const stored = await db.songs.toArray()

    expect(stored).toHaveLength(1)
    expect(stored[0].title).toBe('Grandioso És Tu')
    expect(screen.getByLabelText('Título')).toHaveValue('')
  })

  it('loads an existing song and updates it', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    const existingSong: Song = {
      id: 'song-1',
      title: 'Título original',
      artist: 'Artista original',
      originalKey: 'C',
      currentKey: 'D',
      bpm: 80,
      lyrics: '[D]Letra original',
      notes: 'Nota original',
      isFavorite: true,
      createdAt: '2026-08-20T10:00:00.000Z',
      updatedAt: '2026-08-20T10:00:00.000Z',
    }
    await db.songs.add(existingSong)

    render(<SongForm song={existingSong} onSuccess={onSuccess} />)

    expect(screen.getByLabelText('Título')).toHaveValue('Título original')
    expect(screen.getByLabelText('Artista')).toHaveValue('Artista original')
    expect(screen.getByLabelText('BPM')).toHaveValue('80')
    expect(screen.getByLabelText('Observações')).toHaveValue('Nota original')

    await user.clear(screen.getByLabelText('Título'))
    await user.type(screen.getByLabelText('Título'), 'Título atualizado')
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(async () => {
      expect((await db.songs.get('song-1'))?.title).toBe('Título atualizado')
    })

    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'song-1',
        title: 'Título atualizado',
        isFavorite: true,
      }),
    )
  })
})
