// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SkipLink } from './SkipLink'

describe('SkipLink', () => {
  it('is the first tab stop and moves focus to the main content', async () => {
    const user = userEvent.setup()
    render(<><SkipLink /><button type="button">Outro</button><main><h1>Página</h1></main></>)

    await user.tab()
    const link = screen.getByRole('link', { name: 'Pular para o conteúdo' })
    expect(link).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('main')).toHaveFocus()
  })
})
