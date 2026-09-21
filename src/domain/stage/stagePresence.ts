export type StageReadiness = 'ready' | 'waiting'

export interface StageParticipant {
  userId: string
  displayName: string
  musicalRole: string
  isMd: boolean
  readiness: StageReadiness
}

export interface StagePresencePayload {
  userId: string
  displayName: string
  musicalRole: string
  isMd: boolean
  readiness: StageReadiness
}

export function isStageReadiness(value: unknown): value is StageReadiness {
  return value === 'ready' || value === 'waiting'
}

export function toStageParticipant(value: unknown, mdUserId: string): StageParticipant | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.userId !== 'string' || !record.userId) return null
  return {
    userId: record.userId,
    displayName: typeof record.displayName === 'string' && record.displayName.trim() ? record.displayName.trim() : 'Participante',
    musicalRole: typeof record.musicalRole === 'string' && record.musicalRole.trim() ? record.musicalRole : 'other',
    isMd: record.userId === mdUserId,
    readiness: isStageReadiness(record.readiness) ? record.readiness : 'waiting',
  }
}

export function presenceStateToStageParticipants(state: Record<string, unknown>, mdUserId: string): StageParticipant[] {
  const participants = new Map<string, StageParticipant>()
  for (const value of Object.values(state)) {
    if (!Array.isArray(value)) continue
    for (const presence of value) {
      const participant = toStageParticipant(presence, mdUserId)
      if (participant) participants.set(participant.userId, participant)
    }
  }
  return [...participants.values()].sort((a, b) => {
    if (a.isMd !== b.isMd) return a.isMd ? -1 : 1
    if (a.readiness !== b.readiness) return a.readiness === 'ready' ? -1 : 1
    return a.displayName.localeCompare(b.displayName, 'pt-BR')
  })
}
