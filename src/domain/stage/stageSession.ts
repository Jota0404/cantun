export type StageSessionStatus = 'lobby' | 'live' | 'ended'

export interface StageSession {
  id: string
  serviceId: string
  mdUserId?: string
  status: StageSessionStatus
  createdAt: string
  startedAt?: string
  endedAt?: string
  updatedAt: string
}
