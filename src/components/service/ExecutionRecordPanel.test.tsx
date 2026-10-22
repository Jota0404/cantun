import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { musicalFunctionLabel } from '../team/musicalFunctions'
import { ExecutionRecordPanel } from './ExecutionRecordPanel'
import { getServiceExecution } from '../../application/services/executionHistoryService'

vi.mock('../../application/services/executionHistoryService', () => ({ getServiceExecution: vi.fn() }))

describe('ExecutionRecordPanel', () => {
  beforeEach(() => vi.mocked(getServiceExecution).mockReset())

  it('mostra músicas, equipe, Ex-membro e duração', async () => {
    vi.mocked(getServiceExecution).mockResolvedValue({ success: true, execution: {
      serviceId: 's1', completedAt: '2026-10-04T13:00:00Z', completedByUserId: null,
      stageStartedAt: '2026-10-04T12:00:00Z', stageEndedAt: '2026-10-04T13:30:00Z',
      songs: [{ position: 1, songId: 'a', title: 'Graça', artist: 'Ana', key: 'G' }],
      members: [{ userId: null, name: 'Ex-membro', musicalFunction: 'vocals' }, { userId: 'u', name: 'Bia', musicalFunction: 'electric-guitar' }],
    } })
    render(<ExecutionRecordPanel serviceId="s1" />)
    expect(await screen.findByText(/Graça — Ana · Tom G/)).toBeInTheDocument()
    expect(screen.getByText(`Ex-membro · ${musicalFunctionLabel('vocals')}`)).toBeInTheDocument()
    expect(screen.getByText(`Bia · ${musicalFunctionLabel('electric-guitar')}`)).toBeInTheDocument()
    expect(screen.getByText('Duração do Palco: 1 h 30 min')).toBeInTheDocument()
  })

  it('avisa quando offline', async () => {
    vi.mocked(getServiceExecution).mockResolvedValue({ success: false, errors: ['Disponível com conexão.'] })
    render(<ExecutionRecordPanel serviceId="s1" />)
    expect(await screen.findByText('Disponível com conexão.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Registro da execução' })).toBeInTheDocument()
  })
})
