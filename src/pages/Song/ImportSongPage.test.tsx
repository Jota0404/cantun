// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { db } from '../../db/database'
import { ImportSongPage } from './ImportSongPage'

afterEach(async () => {
  cleanup()
  await db.songs.clear()
})

describe('ImportSongPage', () => {
  it('shows parsed data for review before saving', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ImportSongPage />
      </MemoryRouter>,
    )

    const file = new File(
      ['Título: Oceano\nArtista: Hillsong United\nTom: D\nBPM: 72\nNotas: Abertura\n\n[D]Tu és...'],
      'oceano.txt',
      { type: 'text/plain' },
    )

    await user.upload(screen.getByLabelText('Arquivo .txt'), file)

    expect(await screen.findByRole('heading', { name: 'Revisão' })).toBeInTheDocument()
    expect(screen.getByLabelText('Título')).toHaveValue('Oceano')
    expect(screen.getByLabelText('Artista')).toHaveValue('Hillsong United')
    expect(screen.getByLabelText('Tom original')).toHaveValue('D')
    expect(screen.getByLabelText('BPM')).toHaveValue('72')
    expect(screen.getByLabelText('Cifra/letra')).toHaveValue('[D]Tu és...')
  })

  it('does not show the review form when the txt is invalid', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ImportSongPage />
      </MemoryRouter>,
    )

    const file = new File(['Título: Oceano\nTom: H\n\n'], 'oceano.txt', { type: 'text/plain' })
    await user.upload(screen.getByLabelText('Arquivo .txt'), file)

    expect(await screen.findByRole('alert')).toHaveTextContent('Tom inválido: H.')
    expect(screen.queryByRole('heading', { name: 'Revisão' })).not.toBeInTheDocument()
  })

  it('saves the reviewed imported song through createSong', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ImportSongPage />
      </MemoryRouter>,
    )

    const file = new File(['Título: Oceano\nTom: D\n\n[D]Tu és...'], 'oceano.txt', { type: 'text/plain' })
    await user.upload(screen.getByLabelText('Arquivo .txt'), file)
    await screen.findByRole('heading', { name: 'Revisão' })
    await user.click(screen.getByRole('button', { name: /salvar música/i }))

    await waitFor(async () => {
      expect(await db.songs.count()).toBe(1)
    })

    expect(await db.songs.toArray()).toEqual([
      expect.objectContaining({
        title: 'Oceano',
        originalKey: 'D',
        currentKey: 'D',
        lyrics: '[D]Tu és...',
      }),
    ])
  })
})
