/** RN-A5: UTF-8 e, se houver bytes inválidos, windows-1252 (sem corromper acentos). Remove o BOM. */
export function decodeTextFile(bytes: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/** Lê um arquivo escolhido pelo usuário e decodifica com o fallback acima. */
export async function readTextFile(file: Blob): Promise<string> {
  return decodeTextFile(await file.arrayBuffer())
}
