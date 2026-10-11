// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServiceStageMusicianPage } from './ServiceStageMusicianPage'
import { ServiceStagePage } from './ServiceStagePage'

// O serviço tem um item não musical na posição 0: as músicas ficam nas posições 1 e 2.
const m = vi.hoisted(() => ({ currentIndex: 1, goto: vi.fn(async () => ({ ok: true })) }))
const snapshot = { session: { id: 'st1', status: 'live', mdUserId: 'md' } }

vi.mock('../../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'md' } }) }))
vi.mock('../../application/stage/getServiceStageSongs', () => ({
  getServiceStageSongs: async () => [
    { position: 1, songId: 's1', title: 'Primeira', originalKey: 'G', currentKey: 'G', lyrics: 'G', musicalRole: 'other' },
    { position: 2, songId: 's2', title: 'Última', originalKey: 'D', currentKey: 'D', lyrics: 'D', musicalRole: 'other' },
  ],
}))
vi.mock('../../application/stage/stageExecutionService', () => ({
  StageExecutionService: class {
    connect = async () => snapshot
    disconnect = async () => undefined
    trackPresence = async () => undefined
    getSnapshot = async () => snapshot
  },
}))
vi.mock('../../application/stage/targetSharedExecutionService', () => ({
  TargetSharedExecutionService: class {
    applySnapshot = () => ({ status: 'running', isRunning: true, currentIndex: m.currentIndex, revision: 1, currentKey: undefined })
    subscribe = () => () => undefined
    dispose = () => undefined
    goto = m.goto
  },
}))

function renderAt(path: string, element: React.ReactNode) {
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/stage/:stageSessionId" element={element} /></Routes></MemoryRouter>)
}

describe('Service stage with non-musical items', () => {
  beforeEach(() => { m.goto.mockClear() })

  it('maps the service position to the song and sends the position on goto (MD)', async () => {
    m.currentIndex = 2
    renderAt('/stage/st1', <ServiceStagePage />)
    expect(await screen.findByRole('heading', { name: 'Última' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Próxima/ })).toBeDisabled()
    await userEvent.setup().click(screen.getByRole('button', { name: /Primeira/ }))
    expect(m.goto).toHaveBeenCalledWith('st1', 1, 's1')
  })

  it('musician sees the song at the current position', async () => {
    m.currentIndex = 1
    renderAt('/stage/st1', <ServiceStageMusicianPage />)
    expect(await screen.findByRole('heading', { name: 'Primeira' })).toBeInTheDocument()
  })
})
