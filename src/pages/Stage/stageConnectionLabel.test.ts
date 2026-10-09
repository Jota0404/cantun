import { describe, expect, it } from 'vitest'
import { stageConnectionLabel } from './stageConnectionLabel'

describe('stageConnectionLabel', () => {
  it('translates every realtime status to pt-BR', () => {
    expect(stageConnectionLabel('CONNECTING')).toBe('Conectando…')
    expect(stageConnectionLabel('SUBSCRIBED')).toBe('Conectado')
    expect(stageConnectionLabel('RECONNECTING')).toBe('Reconectando…')
    expect(stageConnectionLabel('ERROR')).toBe('Erro de conexão')
    expect(stageConnectionLabel('DISCONNECTED')).toBe('Desconectado')
  })
})
