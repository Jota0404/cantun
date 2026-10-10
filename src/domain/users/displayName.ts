export const DISPLAY_NAME_MAX = 80

/** RN-15: 1–80 caracteres após `trim`. Retorna o nome normalizado ou `null` se inválido. */
export function normalizeDisplayName(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length >= 1 && trimmed.length <= DISPLAY_NAME_MAX ? trimmed : null
}
