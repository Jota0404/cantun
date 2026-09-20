export type StageSessionStatus = 'lobby' | 'live' | 'ended'

export interface StageSession {
  id: string
  serviceId: string
  legacyBandStageSessionId: string
  status: StageSessionStatus
  createdAt: string
  startedAt?: string
  endedAt?: string
  updatedAt: string
}
