export interface Assignment {
  id: string
  serviceId: string
  userId: string
  musicalFunction: string
  serviceItemId?: string
  status: 'pending' | 'accepted' | 'declined'
  createdAt: string
  updatedAt: string
}
