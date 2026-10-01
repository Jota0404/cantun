export const MAX_STAGE_ANNOTATION_LENGTH = 500

export function normalizeStageAnnotation(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? ''
  return normalized.length > 0 ? normalized.slice(0, MAX_STAGE_ANNOTATION_LENGTH) : null
}
