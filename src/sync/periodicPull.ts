// Pull periódico (issue #127): mantém o aparelho em dia com apagamentos/mudanças de outros aparelhos.
// O push-antes-do-pull e a não-sobreposição vêm do `TargetSyncEngine.sync()`; aqui só se decide QUANDO chamar.
export const PULL_INTERVAL_MS = 90_000
export const PULL_JITTER_MS = 15_000
/** Voltar o foco/visibilidade só puxa se o último pull for mais velho que isto. */
export const PULL_MIN_GAP_MS = 30_000

/** Robusto ao basename (BASE_URL do deploy em subpasta). */
export function isStagePath(pathname: string, base = import.meta.env.BASE_URL): boolean {
  const rest = base !== '/' && pathname.startsWith(base) ? pathname.slice(base.length - 1) : pathname
  return rest.startsWith('/stage/')
}

/** Devolve a função que para o agendamento. O Palco (`/stage/`) tem Realtime próprio e nunca é puxado daqui. */
export function startPeriodicPull(pull: () => Promise<void>, hasSession: () => boolean): () => void {
  let timer: number | undefined
  let running = false
  let lastPull = 0
  let stopped = false

  const eligible = () => hasSession() && navigator.onLine && document.visibilityState === 'visible' && !isStagePath(window.location.pathname)
  const run = async (minGap: number) => {
    if (running || !eligible() || Date.now() - lastPull < minGap) return
    running = true
    lastPull = Date.now()
    try { await pull() } catch { /* o engine já registra e reagenda falhas */ } finally { running = false }
  }
  const schedule = () => {
    if (stopped) return
    timer = window.setTimeout(() => { void run(PULL_MIN_GAP_MS).finally(schedule) }, PULL_INTERVAL_MS + Math.random() * PULL_JITTER_MS)
  }
  const onVisible = () => { if (document.visibilityState === 'visible') void run(PULL_MIN_GAP_MS) }
  const onFocus = () => { void run(PULL_MIN_GAP_MS) }

  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onFocus)
  schedule()
  return () => {
    stopped = true
    window.clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onFocus)
  }
}
