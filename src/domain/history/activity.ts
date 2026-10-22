export type ActivityKind =
  | 'service.ready' | 'service.completed' | 'service.cancelled'
  | 'assignment.confirmed' | 'assignment.declined' | 'assignment.replacement_needed'
  | 'rehearsal.created' | 'material.added' | 'repertoire.updated'

export interface ActivityEvent {
  id: string
  kind: ActivityKind
  actorUserId: string | null
  serviceId: string | null
  entityId: string | null
  entityTitle: string | null
  createdAt: string
}

export function activityText(event: ActivityEvent, names: Record<string, string>): string {
  const author = (event.actorUserId && names[event.actorUserId]) || 'Ex-membro'
  const by = event.actorUserId ? ` · por ${author}` : ''
  const t = event.entityTitle ?? 'item excluído'
  switch (event.kind) {
    case 'service.ready': return `Serviço ${t} ficou pronto${by}`
    case 'service.completed': return `Serviço ${t} foi concluído${by}`
    case 'service.cancelled': return `Serviço ${t} foi cancelado${by}`
    case 'assignment.confirmed': return `${author} confirmou presença em ${t}`
    case 'assignment.declined': return `${author} recusou a escala em ${t}`
    case 'assignment.replacement_needed': return `Precisa de substituto em ${t}`
    case 'rehearsal.created': return `${author} criou um ensaio em ${t}`
    case 'material.added': return `${author} adicionou o material ${t}`
    case 'repertoire.updated': return `${author} atualizou o repertório ${t}`
  }
}
