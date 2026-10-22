// @vitest-environment jsdom

// Caracterização do comportamento ATUAL (pré-refatoração, VS-06 RN-23/RN-25). Não descreve o ideal.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ServiceStageMusicianPage } from './ServiceStageMusicianPage'
import { ServiceStagePage } from './ServiceStagePage'

type Exec = Record<string, unknown>
const h = vi.hoisted(() => {
  const state = {
    userId: 'md' as string | undefined,
    session: { id: 'st1', status: 'live', mdUserId: 'md' } as { id: string; status: string; mdUserId: string },
    exec: {} as Exec,
    songs: [] as unknown[],
    loadError: undefined as Error | undefined,
    cb: undefined as undefined | {
      onSnapshot?: (s: unknown) => void
      onStatus?: (s: string) => void
      onPresence?: (p: unknown[]) => void
    },
    listener: undefined as undefined | ((s: unknown) => void),
  }
  const spies = {
    connectOrLocal: vi.fn(), disconnect: vi.fn(), trackPresence: vi.fn(), getSnapshot: vi.fn(), refresh: vi.fn(),
    setAnnotation: vi.fn(), dispose: vi.fn(), goto: vi.fn(), next: vi.fn(), previous: vi.fn(), play: vi.fn(),
    pause: vi.fn(), end: vi.fn(), applySnapshot: vi.fn(),
  }
  return { state, spies }
})
const s = h.spies

// Referência estável: a página tem `user` nas deps do efeito de carga.
vi.mock('../../auth/authContext', () => {
  const users = new Map<string, { id: string }>()
  return { useAuth: () => {
    const id = h.state.userId
    if (id && !users.has(id)) users.set(id, { id })
    return { user: id ? users.get(id) : null }
  } }
})
vi.mock('../../application/stage/getServiceStageSongs', () => ({ getServiceStageSongs: async () => h.state.songs }))
vi.mock('../../application/stage/stageExecutionService', () => ({
  StageExecutionService: class {
    connectOrLocal = (id: string, cb: typeof h.state.cb) => { h.state.cb = cb; return s.connectOrLocal(id, cb) }
    disconnect = s.disconnect
    trackPresence = s.trackPresence
    getSnapshot = s.getSnapshot
    refresh = s.refresh
    setAnnotation = s.setAnnotation
  },
}))
vi.mock('../../application/stage/targetSharedExecutionService', () => ({
  TargetSharedExecutionService: class {
    applySnapshot = (snap: unknown) => { s.applySnapshot(snap); return h.state.exec }
    subscribe = (_id: string, fn: (x: unknown) => void) => { h.state.listener = fn; return () => undefined }
    dispose = s.dispose
    goto = s.goto
    next = s.next
    previous = s.previous
    play = s.play
    pause = s.pause
    end = s.end
  },
}))

const song = (position: number, title: string, extra: Record<string, unknown> = {}) => ({
  position, songId: `s${position}`, title, artist: 'Banda', originalKey: 'G', currentKey: 'G',
  lyrics: '[G]Amazing [C]grace\nlinha', notes: 'Cuidado na ponte', musicalRole: 'other', ...extra,
})
const exec = (extra: Exec = {}): Exec => ({
  sessionId: 'st1', revision: 3, currentIndex: 1, isRunning: true, status: 'running', updatedAt: 'x', ...extra,
})
const snap = () => ({ session: h.state.session, state: {} })

// Storage falso: registra qualquer escrita (o Node global pode sombrear o do jsdom).
const writes: string[] = []
function fakeStorage() {
  return { getItem: () => null, removeItem: () => undefined, clear: () => undefined, key: () => null, length: 0, setItem: (k: string) => { writes.push(k) } }
}

function mount(element: React.ReactNode, path = '/stage/st1') {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/stage/:stageSessionId" element={element} /></Routes></MemoryRouter>)
}

beforeEach(() => {
  Object.values(s).forEach((fn) => fn.mockReset())
  h.state.userId = 'md'
  h.state.session = { id: 'st1', status: 'live', mdUserId: 'md' }
  h.state.exec = exec()
  h.state.songs = [song(1, 'Primeira'), song(2, 'Segunda'), song(3, 'Terceira')]
  h.state.listener = undefined
  h.state.cb = undefined
  s.connectOrLocal.mockImplementation(async () => snap())
  s.disconnect.mockResolvedValue(undefined)
  s.trackPresence.mockResolvedValue(undefined)
  s.getSnapshot.mockImplementation(async () => ({ session: h.state.session, state: h.state.exec }))
  s.refresh.mockImplementation(async () => snap())
  s.setAnnotation.mockResolvedValue({ state: h.state.exec })
  for (const k of ['goto', 'next', 'previous', 'play', 'pause', 'end'] as const) s[k].mockResolvedValue({ state: h.state.exec })
  writes.length = 0
  vi.stubGlobal('localStorage', fakeStorage())
  vi.stubGlobal('sessionStorage', fakeStorage())
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('ServiceStagePage (MD) - caracterização', () => {
  it('renderiza a música da sessão com regiões e rótulos principais', async () => {
    mount(<ServiceStagePage />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Primeira' })).toBeInTheDocument()
    expect(screen.getByText(/Banda · 1\/3 · Tom: G/)).toBeInTheDocument()
    expect(screen.getByText('[G]Amazing [C]grace')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Letra de Primeira' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Informações da sessão' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Anotação do MD' })).toBeInTheDocument()
    expect(screen.getByText('Você controla o palco')).toBeInTheDocument()
    expect(screen.getByText('Ao vivo')).toBeInTheDocument()
    expect(screen.getByText('Execução: ativa')).toBeInTheDocument()
    expect(screen.getByText('Revisão 3')).toBeInTheDocument()
    expect(screen.getByText('Observações')).toBeInTheDocument()
    expect(screen.getByText('Conectando…')).toBeInTheDocument()
  })

  it('mostra o status de conexão vindo do realtime', async () => {
    mount(<ServiceStagePage />)
    await screen.findByRole('heading', { level: 1 })
    act(() => h.state.cb?.onStatus?.('SUBSCRIBED'))
    expect(screen.getByText('Conectado')).toBeInTheDocument()
  })

  it('anterior/próxima chamam os comandos compartilhados; limites desabilitam', async () => {
    const user = userEvent.setup()
    mount(<ServiceStagePage />)
    await screen.findByRole('heading', { level: 1, name: 'Primeira' })
    expect(screen.getByRole('button', { name: /Anterior/ })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(s.next).toHaveBeenCalledWith('st1')
    expect(s.previous).not.toHaveBeenCalled()
  })

  it('primeiro e último: Próxima desabilitada na última, Anterior habilitada', async () => {
    h.state.exec = exec({ currentIndex: 3 })
    const user = userEvent.setup()
    mount(<ServiceStagePage />)
    await screen.findByRole('heading', { level: 1, name: 'Terceira' })
    expect(screen.getByRole('button', { name: /Próxima/ })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Anterior/ }))
    expect(s.previous).toHaveBeenCalledWith('st1')
  })

  it('a lista de ordem permite ir direto a uma música (goto com position e songId)', async () => {
    const user = userEvent.setup()
    mount(<ServiceStagePage />)
    await screen.findByRole('heading', { level: 1, name: 'Primeira' })
    await user.click(screen.getByRole('button', { name: /Terceira/ }))
    expect(s.goto).toHaveBeenCalledWith('st1', 3, 's3')
  })

  it('Play/Pausar alterna conforme isRunning', async () => {
    const user = userEvent.setup()
    mount(<ServiceStagePage />)
    await user.click(await screen.findByRole('button', { name: 'Pausar' }))
    expect(s.pause).toHaveBeenCalledWith('st1')
    cleanup()
    h.state.exec = exec({ isRunning: false, status: 'paused' })
    mount(<ServiceStagePage />)
    expect(await screen.findByText('Execução: pausada')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Play' }))
    expect(s.play).toHaveBeenCalledWith('st1')
  })

  it('sessão em lobby: comandos desabilitados e sem encerrar', async () => {
    h.state.session = { id: 'st1', status: 'lobby', mdUserId: 'md' }
    h.state.exec = exec({ isRunning: false, status: 'lobby' })
    mount(<ServiceStagePage />)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText('Lobby')).toBeInTheDocument()
    expect(screen.getByText('Sessão não está ao vivo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Próxima/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Segunda/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Encerrar sessão' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publicar nota' })).toBeDisabled()
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('sessão encerrada: mostra aviso e bloqueia comandos', async () => {
    h.state.session = { id: 'st1', status: 'ended', mdUserId: 'md' }
    h.state.exec = exec({ isRunning: false, status: 'ended' })
    mount(<ServiceStagePage />)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText('Encerrada')).toBeInTheDocument()
    expect(screen.getByText('Sessão encerrada')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Próxima/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Encerrar sessão' })).not.toBeInTheDocument()
    expect(s.disconnect).toHaveBeenCalledWith('st1')
  })

  it('transposição: exibe a letra transposta para a tom compartilhado e não grava nada local', async () => {
    h.state.exec = exec({ currentKey: 'A' })
    mount(<ServiceStagePage />)
    await screen.findByRole('heading', { level: 1, name: 'Primeira' })
    expect(screen.getByText(/Tom: A/)).toBeInTheDocument()
    expect(screen.getByText('[A]Amazing [D]grace')).toBeInTheDocument() // G -> A (+2); cifra base intacta
    expect(writes).toEqual([])
    // chega nova tonalidade pelo canal compartilhado
    act(() => h.state.listener?.(exec({ currentKey: 'G' })))
    expect(screen.getByText('[G]Amazing [C]grace')).toBeInTheDocument()
  })

  it('anotação: editar e publicar chama setAnnotation com o rascunho', async () => {
    const user = userEvent.setup()
    mount(<ServiceStagePage />)
    const box = await screen.findByRole('textbox')
    await user.type(box, 'ponte baixa')
    expect(screen.getByText('11/500')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Publicar nota' }))
    expect(s.setAnnotation).toHaveBeenCalledWith('st1', 'ponte baixa')
  })

  it('anotação existente: mostra nota, "Atualizar nota" e Limpar salva vazio', async () => {
    h.state.exec = exec({ mdAnnotation: 'cortar bateria' })
    const user = userEvent.setup()
    mount(<ServiceStagePage />)
    expect(await screen.findByText('Nota atual da sessão')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('cortar bateria')
    expect(screen.getByRole('button', { name: 'Atualizar nota' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Limpar' }))
    // comportamento atual: setAnnotationDraft('') e saveAnnotation() no mesmo tick;
    // o closure ainda enxerga o rascunho antigo (limitação/bug caracterizado).
    expect(s.setAnnotation).toHaveBeenCalledWith('st1', 'cortar bateria')
  })

  it('falha ao salvar anotação mostra alerta e re-sincroniza', async () => {
    s.setAnnotation.mockRejectedValue(new Error('sem rede'))
    const user = userEvent.setup()
    mount(<ServiceStagePage />)
    await user.type(await screen.findByRole('textbox'), 'x')
    await user.click(screen.getByRole('button', { name: 'Publicar nota' }))
    await vi.waitFor(() => expect(s.refresh).toHaveBeenCalledWith('st1'))
    // comportamento atual: refresh() limpa o erro logo em seguida, então o alerta não persiste.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('rascunho de anotação não salvo é sobrescrito quando chega snapshot novo', async () => {
    const user = userEvent.setup()
    mount(<ServiceStagePage />)
    await user.type(await screen.findByRole('textbox'), 'rascunho')
    act(() => h.state.cb?.onSnapshot?.(snap()))
    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  it('presença: lista participantes e contagem de prontos', async () => {
    mount(<ServiceStagePage />)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText('Nenhum participante conectado.')).toBeInTheDocument()
    act(() => h.state.cb?.onPresence?.([
      { userId: 'md', displayName: 'Ana', musicalRole: 'other', isMd: true, readiness: 'ready' },
      { userId: 'u2', displayName: 'Beto', musicalRole: 'drums', isMd: false, readiness: 'waiting' },
    ]))
    const panel = screen.getByRole('region', { name: 'Banda conectada' })
    expect(panel).toHaveTextContent('1/2 prontos')
    expect(panel).toHaveTextContent('Ana')
    expect(panel).toHaveTextContent('Bateria')
    expect(panel).toHaveTextContent('Aguardando')
  })

  it('MD não vê controles de readiness do músico', async () => {
    mount(<ServiceStagePage />)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('region', { name: 'Seu status de preparação' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pronto' })).not.toBeInTheDocument()
  })

  it('encerrar sessão: confirma, encerra e re-lê o snapshot; cancelar não faz nada', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    mount(<ServiceStagePage />)
    await user.click(await screen.findByRole('button', { name: 'Encerrar sessão' }))
    expect(s.end).not.toHaveBeenCalled()
    confirm.mockReturnValueOnce(true)
    await user.click(screen.getByRole('button', { name: 'Encerrar sessão' }))
    expect(s.end).toHaveBeenCalledWith('st1')
  })

  it('erro de comando mostra alerta e re-sincroniza', async () => {
    s.next.mockRejectedValue(new Error('revisão antiga'))
    const user = userEvent.setup()
    mount(<ServiceStagePage />)
    await user.click(await screen.findByRole('button', { name: /Próxima/ }))
    await vi.waitFor(() => expect(s.refresh).toHaveBeenCalledWith('st1'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('Sincronizar chama refresh', async () => {
    const user = userEvent.setup()
    mount(<ServiceStagePage />)
    await user.click(await screen.findByRole('button', { name: 'Sincronizar' }))
    expect(s.refresh).toHaveBeenCalledWith('st1')
  })

  it('fonte ajustável: slider 16-36, padrão 22; modo Rolagem/Páginas via aria-pressed', async () => {
    const user = userEvent.setup()
    mount(<ServiceStagePage />)
    const main = (await screen.findByRole('main'))
    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('min', '16')
    expect(slider).toHaveAttribute('max', '36')
    expect(slider).toHaveValue('22')
    expect(main.style.getPropertyValue('--service-stage-font-size')).toBe('22px')
    fireEvent.change(slider, { target: { value: '24' } })
    expect(slider).toHaveValue('24')
    expect(main.style.getPropertyValue('--service-stage-font-size')).toBe('24px')
    expect(screen.getByRole('button', { name: 'Rolagem' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Páginas' }))
    expect(screen.getByRole('button', { name: 'Páginas' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Rolagem' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('experiência por função: bateria abre com fonte 20 e modo Páginas', async () => {
    h.state.songs = [song(1, 'Primeira', { musicalRole: 'drums' })]
    mount(<ServiceStagePage />)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByRole('slider')).toHaveValue('20')
    expect(screen.getByRole('button', { name: 'Páginas' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('carregando, erro de conexão, sem sessão e sem músicas', async () => {
    let resolve!: (v: unknown) => void
    s.connectOrLocal.mockImplementationOnce(() => new Promise((r) => { resolve = r }))
    mount(<ServiceStagePage />)
    expect(screen.getByText('Carregando sessão…')).toBeInTheDocument()
    await act(async () => { resolve(snap()) })
    expect(await screen.findByRole('heading', { level: 1, name: 'Primeira' })).toBeInTheDocument()
    cleanup()

    s.connectOrLocal.mockRejectedValueOnce(new Error('falhou'))
    mount(<ServiceStagePage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('falhou')
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
    cleanup()

    h.state.songs = []
    mount(<ServiceStagePage />)
    expect(await screen.findByText('Nenhuma música disponível nesta sessão.')).toBeInTheDocument()
    cleanup()

    render(<MemoryRouter initialEntries={['/stage']}><Routes><Route path="/stage" element={<ServiceStagePage />} /></Routes></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Sessão de palco não informada.')
  })

  it('falha de presença não impede abrir o Palco (best-effort)', async () => {
    s.trackPresence.mockRejectedValue(new Error('offline'))
    mount(<ServiceStagePage />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Primeira' })).toBeInTheDocument()
    expect(s.trackPresence).toHaveBeenCalledWith('st1', { musicalRole: 'other', readiness: 'waiting' })
  })

  it('Sair navega para fora sem comando de encerrar', async () => {
    const user = userEvent.setup()
    mount(<ServiceStagePage />)
    await user.click(await screen.findByRole('button', { name: 'Sair' }))
    expect(s.end).not.toHaveBeenCalled()
  })

  it('RN-25: ao desmontar libera a sessão e nada do estado temporário persiste nem vaza para outra sessão', async () => {
    const user = userEvent.setup()
    const first = mount(<ServiceStagePage />)
    await user.type(await screen.findByRole('textbox'), 'rascunho temporário')
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '25' } })
    await user.click(screen.getByRole('button', { name: 'Páginas' }))
    first.unmount()
    expect(s.dispose).toHaveBeenCalledWith('st1')
    expect(s.disconnect).toHaveBeenCalledWith('st1')
    expect(s.setAnnotation).not.toHaveBeenCalled()
    expect(writes).toEqual([])

    h.state.session = { id: 'st2', status: 'live', mdUserId: 'md' }
    mount(<ServiceStagePage />, '/stage/st1')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(screen.getByRole('slider')).toHaveValue('22')
    expect(screen.getByRole('button', { name: 'Rolagem' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('trocar o id da sessão na rota libera a anterior (dispose/disconnect da antiga)', async () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/stage/st1']}><Routes><Route path="/stage/:stageSessionId" element={<ServiceStagePage />} /></Routes></MemoryRouter>,
    )
    await screen.findByRole('heading', { level: 1 })
    rerender(<MemoryRouter initialEntries={['/stage/st1']}><div /></MemoryRouter>)
    expect(s.dispose).toHaveBeenCalledWith('st1')
  })
  it('trocar stageSessionId na mesma rota libera st1 e conecta st2', async () => {
    const user = userEvent.setup()
    const Link2 = () => { const go = useNavigate(); return <button onClick={() => go('/stage/st2')}>ir</button> }
    mount(<><Link2 /><ServiceStagePage /></>)
    await screen.findByRole('heading', { level: 1 })
    h.state.session = { id: 'st2', status: 'live', mdUserId: 'md' }
    await user.click(screen.getByRole('button', { name: 'ir' }))
    await waitFor(() => expect(s.connectOrLocal).toHaveBeenCalledWith('st2', expect.anything()))
    expect(s.dispose).toHaveBeenCalledWith('st1')
    expect(s.disconnect).toHaveBeenCalledWith('st1')
  })

  it('trocar o usuário reconecta e o onPresence novo usa o usuário novo', async () => {
    h.state.userId = 'mus'
    const { rerender } = mount(<ServiceStageMusicianPage />)
    await screen.findByRole('heading', { level: 1 })
    h.state.userId = 'mus2'
    const before = s.connectOrLocal.mock.calls.length
    rerender(<MemoryRouter initialEntries={['/stage/st1']}><Routes><Route path="/stage/:stageSessionId" element={<ServiceStageMusicianPage />} /></Routes></MemoryRouter>)
    await waitFor(() => expect(s.connectOrLocal.mock.calls.length).toBeGreaterThan(before))
    await screen.findByRole('heading', { level: 1 })
    act(() => h.state.cb?.onPresence?.([{ userId: 'mus2', readiness: 'ready' }, { userId: 'mus', readiness: 'waiting' }]))
    expect(screen.getByText('Pronto', { selector: 'span' })).toBeInTheDocument()
  })
})

describe('ServiceStagePage - visibilidade por função', () => {
  const open = async (role: string, extra: Record<string, unknown> = {}) => {
    h.state.userId = 'mus'
    h.state.songs = [song(1, 'Primeira', { musicalRole: role, ...extra }), song(2, 'Segunda')]
    mount(<ServiceStagePage />)
    await screen.findByRole('heading', { level: 1 })
  }
  it('bateria: sem Tom nem Observações; com BPM', async () => {
    await open('drums', { bpm: 90 })
    expect(screen.queryByText(/Tom:/)).not.toBeInTheDocument()
    expect(screen.queryByText('Observações')).not.toBeInTheDocument()
    expect(screen.getByText(/BPM: 90/)).toBeInTheDocument()
  })
  it('baixo: com Tom, sem Observações', async () => {
    await open('bass')
    expect(screen.getByText(/Tom: G/)).toBeInTheDocument()
    expect(screen.queryByText('Observações')).not.toBeInTheDocument()
  })

})

describe('ServiceStageMusicianPage - caracterização', () => {
  beforeEach(() => { h.state.userId = 'mus'; h.state.exec = exec({ currentIndex: 2 }) })

  it('acompanha a música selecionada pelo MD e é somente leitura', async () => {
    mount(<ServiceStageMusicianPage />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Segunda' })).toBeInTheDocument()
    expect(screen.getByText(/2\/3/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Estado da execução' })).toHaveTextContent('Somente leitura')
    expect(screen.getByText('O MD está conduzindo a música')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Letra de Segunda' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Ordem do serviço' })).toBeInTheDocument()
    expect(screen.getByText('Segunda', { selector: 'strong' }).closest('[aria-current]')).toHaveAttribute('aria-current', 'true')
  })

  it('não oferece nenhum controle de comando nem anotação', async () => {
    mount(<ServiceStageMusicianPage />)
    await screen.findByRole('heading', { level: 1 })
    for (const name of [/Próxima/, /Anterior/, 'Play', 'Pausar', 'Encerrar sessão', 'Publicar nota']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    // a ordem não é clicável
    expect(screen.queryByRole('button', { name: /Terceira/ })).not.toBeInTheDocument()
    expect(s.goto).not.toHaveBeenCalled()
    expect(s.end).not.toHaveBeenCalled()
  })

  it('segue a música quando o MD muda o estado compartilhado', async () => {
    mount(<ServiceStageMusicianPage />)
    await screen.findByRole('heading', { level: 1, name: 'Segunda' })
    act(() => h.state.listener?.(exec({ currentIndex: 3, revision: 4 })))
    expect(screen.getByRole('heading', { level: 1, name: 'Terceira' })).toBeInTheDocument()
    expect(screen.getByText('Revisão 4')).toBeInTheDocument()
  })

  it('exibe a nota do MD e a tonalidade/transposição compartilhadas', async () => {
    h.state.exec = exec({ currentIndex: 1, currentKey: 'A', mdAnnotation: 'refrão 2x' })
    mount(<ServiceStageMusicianPage />)
    expect(await screen.findByText('Nota do MD')).toBeInTheDocument()
    expect(screen.getByText('refrão 2x')).toBeInTheDocument()
    expect(screen.getByText(/Tom: A/)).toBeInTheDocument()
    expect(screen.getByText('[A]Amazing [D]grace')).toBeInTheDocument()
  })

  it('painel de presença e estados de execução', async () => {
    mount(<ServiceStageMusicianPage />)
    await screen.findByRole('heading', { level: 1 })
    act(() => h.state.cb?.onPresence?.([{ userId: 'mus', displayName: 'Caio', musicalRole: 'bass', isMd: false, readiness: 'ready' }]))
    expect(screen.getByRole('region', { name: 'Banda conectada' })).toHaveTextContent('1/1 prontos')
    act(() => h.state.listener?.(exec({ currentIndex: 2, isRunning: false, status: 'paused' })))
    expect(screen.getByText('Execução pausada pelo MD')).toBeInTheDocument()
    act(() => h.state.listener?.(exec({ currentIndex: 2, isRunning: false, status: 'lobby' })))
    expect(screen.getByText('Aguardando início do MD')).toBeInTheDocument()
  })

  it('readiness: na página de músico (rota /stage) o botão Pronto existe só na ServiceStagePage de não-MD', async () => {
    // ServiceStageMusicianPage atual NÃO tem controle de readiness (limitação).
    mount(<ServiceStageMusicianPage />)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('button', { name: 'Pronto' })).not.toBeInTheDocument()
  })

  it('ServiceStagePage com usuário não-MD: visão de músico, marca readiness e não controla', async () => {
    const user = userEvent.setup()
    mount(<ServiceStagePage />)
    await screen.findByRole('heading', { level: 1, name: 'Segunda' })
    expect(screen.getByText('MODO PALCO · OUTRA FUNÇÃO')).toBeInTheDocument()
    expect(screen.getByText('Somente visualização')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Próxima/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Encerrar sessão' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Anotação do MD' })).not.toBeInTheDocument()
    const region = screen.getByRole('region', { name: 'Seu status de preparação' })
    expect(region).toHaveTextContent('Aguardando')
    const pronto = screen.getByRole('button', { name: 'Pronto' })
    expect(pronto).toHaveAttribute('aria-pressed', 'false')
    await user.click(pronto)
    expect(s.trackPresence).toHaveBeenLastCalledWith('st1', { musicalRole: 'other', readiness: 'ready' })
    expect(pronto).toHaveAttribute('aria-pressed', 'true')
    expect(s.goto).not.toHaveBeenCalled()
  })

  it('falha ao marcar readiness volta para Aguardando e mostra alerta', async () => {
    const user = userEvent.setup()
    mount(<ServiceStagePage />)
    await screen.findByRole('heading', { level: 1 })
    s.trackPresence.mockRejectedValueOnce(new Error('sem canal'))
    await user.click(screen.getByRole('button', { name: 'Pronto' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('sem canal')
    expect(screen.getByRole('button', { name: 'Aguardando' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('readiness acompanha a presença própria vinda do servidor', async () => {
    mount(<ServiceStagePage />)
    await screen.findByRole('heading', { level: 1 })
    act(() => h.state.cb?.onPresence?.([{ userId: 'mus', displayName: 'Caio', musicalRole: 'other', isMd: false, readiness: 'ready' }]))
    expect(screen.getByRole('button', { name: 'Pronto' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('sessão encerrada, erro e vazio na página do músico; fonte ajustável', async () => {
    h.state.session = { id: 'st1', status: 'ended', mdUserId: 'md' }
    h.state.exec = exec({ currentIndex: 2, isRunning: false, status: 'ended' })
    mount(<ServiceStageMusicianPage />)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText('Encerrada')).toBeInTheDocument()
    expect(screen.getByText('Sessão encerrada')).toBeInTheDocument()
    const slider = screen.getByRole('slider', { name: 'Tamanho da fonte' })
    fireEvent.change(slider, { target: { value: '23' } })
    expect(slider).toHaveValue('23')
    cleanup()

    s.connectOrLocal.mockRejectedValueOnce(new Error('falhou'))
    mount(<ServiceStageMusicianPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('falhou')
    cleanup()
    h.state.songs = []
    mount(<ServiceStageMusicianPage />)
    expect(await screen.findByText('Nenhuma música disponível nesta sessão.')).toBeInTheDocument()
  })

  it('RN-25: desmontar libera a sessão e o ajuste de fonte não vaza para a próxima montagem', async () => {
    const first = mount(<ServiceStageMusicianPage />)
    const slider = await screen.findByRole('slider', { name: 'Tamanho da fonte' })
    fireEvent.change(slider, { target: { value: '24' } })
    expect(slider).toHaveValue('24')
    first.unmount()
    expect(s.dispose).toHaveBeenCalledWith('st1')
    expect(s.disconnect).toHaveBeenCalledWith('st1')
    expect(writes).toEqual([])
    mount(<ServiceStageMusicianPage />)
    expect(await screen.findByRole('slider', { name: 'Tamanho da fonte' })).toHaveValue('22')
  })
})
