// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
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
})