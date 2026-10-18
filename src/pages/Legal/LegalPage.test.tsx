// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { axeViolations } from '../../test/axe'
import { CONSENT_VERSION } from '../../domain/privacy/consent'
import { LegalPage } from './LegalPage'

describe('LegalPage', () => {
  it.each([['privacy', 'Política de Privacidade'], ['terms', 'Termos de Uso']] as const)('mostra %s com versão e aviso de rascunho, sem sessão', async (document, title) => {
    const { container } = render(<MemoryRouter><LegalPage document={document} /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`Versão ${CONSENT_VERSION}`))).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(/rascunho, sujeito a revisão jurídica/i)
    expect(await axeViolations(container)).toEqual([])
  })
})
