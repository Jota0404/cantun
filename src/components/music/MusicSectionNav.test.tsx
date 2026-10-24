// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { MusicSectionNav } from './MusicSectionNav'

describe('MusicSectionNav', () => {
  it('shows the title and marks the current section', () => {
    render(<MemoryRouter><MusicSectionNav current="repertoires" /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Músicas' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Repertórios' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Biblioteca' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Biblioteca' })).toHaveAttribute('href', '/songs')
  })
})
