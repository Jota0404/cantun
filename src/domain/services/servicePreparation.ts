/** RN-15: "preparado" por pessoa e serviço. `id` é derivado (`serviceId:userId`) só para a fila de sync e o Dexie. */
export interface ServicePreparation {
  id: string
  serviceId: string
  userId: string
  preparedAt: string
  updatedAt: string
}

export const preparationId = (serviceId: string, userId: string) => `${serviceId}:${userId}`
