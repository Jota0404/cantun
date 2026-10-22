/** RN-22…25: material de apoio (só link). Exatamente um dono: serviço, ensaio ou música. */
export interface Material {
  id: string
  organizationId: string
  serviceId?: string
  rehearsalId?: string
  songId?: string
  kind: 'link'
  title: string
  url: string
  notes?: string
  createdByUserId?: string
  createdAt: string
  updatedAt: string
}

export const MATERIAL_URL_MAX = 2048

export type ParsedMaterialUrl = { ok: true; href: string; domain: string } | { ok: false; error: string }

/** Só `https:`, sem credenciais embutidas, sem espaço, até 2048 caracteres. */
export function parseMaterialUrl(url: string): ParsedMaterialUrl {
  const raw = url.trim()
  const invalid = { ok: false, error: 'Informe um link https válido.' } as const
  if (!raw || raw.length > MATERIAL_URL_MAX || /\s/.test(raw)) return invalid
  let parsed: URL
  try { parsed = new URL(raw) } catch { return invalid }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) return invalid
  if (parsed.href.length > MATERIAL_URL_MAX || !/^https:\/\/[^\s]+$/.test(parsed.href)) return invalid
  return { ok: true, href: parsed.href, domain: parsed.hostname.replace(/^www\./, '') }
}

export function validateMaterial(value: Pick<Material, 'serviceId' | 'rehearsalId' | 'songId' | 'title' | 'url' | 'notes'>): string[] {
  const errors: string[] = []
  const title = value.title.trim()
  if (title.length < 1 || title.length > 120) errors.push('O título deve ter de 1 a 120 caracteres.')
  const parsed = parseMaterialUrl(value.url)
  if (!parsed.ok) errors.push(parsed.error)
  if ((value.notes?.trim().length ?? 0) > 500) errors.push('As observações devem ter no máximo 500 caracteres.')
  if ([value.serviceId, value.rehearsalId, value.songId].filter(Boolean).length !== 1) errors.push('O material deve pertencer a exatamente um serviço, ensaio ou música.')
  return errors
}
