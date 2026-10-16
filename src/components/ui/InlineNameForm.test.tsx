// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../../test/axe'
import { InlineNameForm } from './InlineNameForm'

function setup(onSubmit = vi.fn().mockResolvedValue(undefined), initialValue?: string) {
  const onCancel = vi.fn()
  const view = render(<InlineNameForm label="Nome da banda" submitLabel="Criar banda" initialValue={initialValue} onSubmit={onSubmit} onCancel={onCancel} />)
  return { onSubmit, onCancel, view }
}

describe('InlineNameForm', () => {
  it('focuses the field and submits the trimmed name', async () => {
    const user = userEvent.setup()
    const { onSubmit } = setup()
    expect(screen.getByLabelText('Nome da banda')).toHaveFocus()
    await user.type(screen.getByLabelText('Nome da banda'), '  Banda de domingo  ')
    await user.click(screen.getByRole('button', { name: 'Criar banda' }))
    expect(onSubmit).toHaveBeenCalledWith('Banda de domingo')
  })

  it('refuses an empty name with a text error and keeps the form', async () => {
    const user = userEvent.setup()
    const { onSubmit } = setup()
    await user.click(screen.getByRole('button', { name: 'Criar banda' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o nome da banda.')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows the error from the action and keeps what was typed', async () => {
    const user = userEvent.setup()
    setup(vi.fn().mockRejectedValue(new Error('Sem conexão.')), 'Louvor')
    await user.click(screen.getByRole('button', { name: 'Criar banda' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão.')
    expect(screen.getByLabelText('Nome da banda')).toHaveValue('Louvor')
  })

  it('cancels and has no accessibility violations', async () => {
    const user = userEvent.setup()
    const { onCancel, view } = setup()
    expect(await axeViolations(view.container)).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
