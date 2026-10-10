// Avisa a UI que um pull terminou e o Dexie pode ter dados novos do servidor.
const listeners = new Set<() => void>()

export function onRemoteDataApplied(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function notifyRemoteDataApplied(): void {
  for (const listener of listeners) listener()
}
