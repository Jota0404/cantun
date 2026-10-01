import type { MusicalRole } from '../bands/musicalRole'
import { isMusicalRole } from '../bands/musicalRole'

export type BandStageReadiness = 'ready' | 'waiting'

export interface BandStageParticipant {
  userId: string
  displayName: string
  musicalRole: MusicalRole
  isMd: boolean
  readiness: BandStageReadiness
}

export interface BandStagePresencePayload {
  userId: string
  displayName: string
  musicalRole: MusicalRole
  isMd: boolean
  readiness: BandStageReadiness
}

export function isBandStageReadiness(value: unknown): value is BandStageReadiness {
  return value === 'ready' || value === 'waiting'
}

export function toBandStageParticipant(value: unknown, mdUserId: string): BandStageParticipant | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.userId !== 'string' || !record.userId) return null
  return {
    userId: record.userId,
    displayName: typeof record.displayName === 'string' && record.displayName.trim() ? record.displayName.trim() : 'Participante',
    musicalRole: isMusicalRole(record.musicalRole) ? record.musicalRole : 'other',
    isMd: record.userId === mdUserId,
    readiness: isBandStageReadiness(record.readiness) ? record.readiness : 'waiting',
  }
}

export function presenceStateToParticipants(state: Record<string, unknown>, mdUserId: string): BandStageParticipant[] {
  const participants = new Map<string, BandStageParticipant>()
  for (const value of Object.values(state)) {
    if (!Array.isArray(value)) continue
    for (const presence of value) {
      const participant = toBandStageParticipant(presence, mdUserId)
      if (participant) participants.set(participant.userId, participant)
    }
  }
  return [...participants.values()].sort((a, b) => {
    if (a.isMd !== b.isMd) return a.isMd ? -1 : 1
    if (a.readiness !== b.readiness) return a.readiness === 'ready' ? -1 : 1
    return a.displayName.localeCompare(b.displayName, 'pt-BR')
  })
}
