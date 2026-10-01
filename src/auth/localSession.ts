import type { SalmodiaDatabase } from '../db/database'

/**
 * Isolamento dos dados locais por usuário (Blueprint §50.3, ADR-048).
 *
 * O IndexedDB é um cache da aplicação, não um mecanismo de autorização:
 * ao sair, ou quando outro usuário entra no mesmo aparelho, os dados locais
 * da sessão anterior não podem continuar visíveis nem ser enviados para a
 * conta do novo usuário.
 */

export const LOCAL_DATA_OWNER_KEY = 'cantum-local-data-owner'

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export class PendingLocalChangesError extends Error {
  readonly pendingCount: number

  constructor(pendingCount: number) {
    super(`Existem ${pendingCount} alteração(ões) locais ainda não sincronizadas.`)
    this.name = 'PendingLocalChangesError'
    this.pendingCount = pendingCount
  }
}

function safeGet(storage: KeyValueStorage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function safeSet(storage: KeyValueStorage | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value)
  } catch {
    // Storage indisponível (modo privado, bloqueio do navegador): segue sem marcador.
  }
}

function safeRemove(storage: KeyValueStorage | null, key: string): void {
  try {
    storage?.removeItem(key)
  } catch {
    // idem
  }
}

export function getBrowserStorage(): KeyValueStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Quantidade de operações locais ainda não enviadas ao Supabase, em todas as filas. */
export async function countPendingLocalChanges(db: SalmodiaDatabase): Promise<number> {
  const [legacy, band, target] = await Promise.all([
    db.syncQueue.count(),
    db.bandSyncQueue.count(),
    db.targetSyncQueue.count(),
  ])
  return legacy + band + target
}

/** Apaga todos os dados de domínio e filas do IndexedDB (o schema é mantido). */
export async function clearLocalUserData(db: SalmodiaDatabase): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })
}

/**
 * Garante que os dados locais pertencem a `userId` antes de qualquer leitura ou sincronização.
 *
 * - Mesmo dono: nada a fazer.
 * - Dono diferente: limpa o banco local (evita exibir ou enviar dados de outra conta).
 * - Sem dono registrado (primeiro login no aparelho, dados do MVP offline): preserva os dados,
 *   que serão enviados pelo bootstrap de sincronização, e registra o dono.
 *
 * @returns `true` quando os dados locais foram limpos.
 */
export async function ensureLocalDataOwner(
  db: SalmodiaDatabase,
  userId: string,
  storage: KeyValueStorage | null = getBrowserStorage(),
): Promise<boolean> {
  const owner = safeGet(storage, LOCAL_DATA_OWNER_KEY)
  let cleared = false

  if (owner && owner !== userId) {
    await clearLocalUserData(db)
    cleared = true
  }

  if (owner !== userId) safeSet(storage, LOCAL_DATA_OWNER_KEY, userId)
  return cleared
}

export interface SignOutWithLocalCleanupDeps {
  db: SalmodiaDatabase
  /** Tenta enviar as filas pendentes antes de sair. Falhas são toleradas. */
  flushPendingChanges: () => Promise<void>
  /** Encerra a sessão remota. Se lançar erro, nada local é apagado. */
  signOutRemote: () => Promise<void>
  storage?: KeyValueStorage | null
}

export interface SignOutOptions {
  /** Confirma o descarte de alterações locais que não puderam ser sincronizadas. */
  discardPendingChanges?: boolean
}

/**
 * Saída segura: sincroniza o que puder, recusa sair com alterações pendentes
 * (a menos que o usuário confirme o descarte) e só então limpa os dados locais.
 */
export async function signOutWithLocalCleanup(
  deps: SignOutWithLocalCleanupDeps,
  options: SignOutOptions = {},
): Promise<void> {
  const storage = deps.storage === undefined ? getBrowserStorage() : deps.storage

  try {
    await deps.flushPendingChanges()
  } catch {
    // Sem conexão ou erro de rede: a contagem abaixo decide.
  }

  const pending = await countPendingLocalChanges(deps.db)
  if (pending > 0 && !options.discardPendingChanges) {
    throw new PendingLocalChangesError(pending)
  }

  await deps.signOutRemote()
  await clearLocalUserData(deps.db)
  safeRemove(storage, LOCAL_DATA_OWNER_KEY)
}
