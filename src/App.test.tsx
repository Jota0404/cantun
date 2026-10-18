// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

const auth = vi.hoisted(() => ({ value: { user: null as null | { id: string; consentRequired?: boolean }, loading: false, configured: true, acceptConsent: vi.fn(), signOut: vi.fn() } }))
vi.mock('./auth/authContext', () => ({ useAuth: () => auth.value }))
vi.mock('./sync/syncService', () => ({ syncTargetDomain: vi.fn() }))
vi.mock('./components/nav/AppNav', () => ({ AppNav: () => <nav>menu</nav> }))
vi.mock('./components/auth/EmailVerificationNotice', () => ({ EmailVerificationNotice: () => null }))
vi.mock('./components/sync/SyncStatusNotice', () => ({ SyncStatusNotice: () => null }))

describe('App: Política e Termos', () => {
  it('abrem sem sessão, sem redirecionar para o login', () => {
    auth.value.user = null
    render(<MemoryRouter initialEntries={['/termos']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: 'Termos de Uso' })).toBeInTheDocument()
  })

  it('versão nova (D7) barra o app até o re-aceite, mas os textos continuam abertos', () => {
    auth.value.user = { id: 'u1', consentRequired: true }
    const { unmount } = render(<MemoryRouter initialEntries={['/songs']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Atualizamos a Política e os Termos' })).toBeInTheDocument()
    unmount()
    render(<MemoryRouter initialEntries={['/privacidade']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: 'Política de Privacidade' })).toBeInTheDocument()
  })

  it('o Palco nunca é barrado pelo re-aceite', () => {
    auth.value.user = { id: 'u1', consentRequired: true }
    render(<MemoryRouter initialEntries={['/stage/song/x']}><App /></MemoryRouter>)
    expect(screen.queryByRole('heading', { name: 'Atualizamos a Política e os Termos' })).not.toBeInTheDocument()
  })

  it('o redirect para o login preserva o aviso "Conta excluída"', async () => {
    auth.value.user = null
    render(<MemoryRouter initialEntries={[{ pathname: '/mais', state: { notice: 'Conta excluída' } }]}><App /></MemoryRouter>)
    expect(await screen.findByText('Conta excluída')).toBeInTheDocument()
  })
})
