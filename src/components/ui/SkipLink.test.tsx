// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SkipLink } from './SkipLink'

describe('SkipLink', () => {
  it('is the first tab stop and moves focus to the main content', async () => {
    const user = userEvent.setup()
    render(<><SkipLink /><button type="button">Outro</button><div id="conteudo" tabIndex={-1}><section><h1>Página sem main</h1></section></div></>)

    await user.tab()
    const link = screen.getByRole('link', { name: 'Pular para o conteúdo' })
    expect(link).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(document.getElementById('conteudo')).toHaveFocus()
  })
})
