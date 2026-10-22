import { activityText } from '../../domain/history/activity'
import type { ActivityEvent, ActivityKind } from '../../domain/history/activity'
import { ApiError } from '../../platform/http'
import { rpc } from '../../platform/rpc'
import { getMemberDisplayNames } from '../teams/teamMemberService'

export interface ActivityItem { id: string; kind: ActivityKind; text: string; serviceId: string | null; createdAt: string }

interface RawActivity {
  id: string; kind: ActivityKind; actor_user_id: string | null; service_id: string | null
  entity_id: string | null; entity_title: string | null; created_at: string
}

export interface ActivityDeps {
  call: typeof rpc
  displayNames: (organizationId: string) => Promise<Record<string, string>>
}
const defaultDeps: ActivityDeps = { call: rpc, displayNames: getMemberDisplayNames }

export async function getRecentActivity(
  organizationId: string,
  deps: ActivityDeps = defaultDeps,
): Promise<{ success: true; events: ActivityItem[] } | { success: false; errors: string[] }> {
  try {
    const raw = await deps.call<RawActivity[]>('get_recent_activity', { p_organization_id: organizationId })
    const names = await deps.displayNames(organizationId)
    return {
      success: true,
      events: raw.map((r) => {
        const e: ActivityEvent = { id: r.id, kind: r.kind, actorUserId: r.actor_user_id, serviceId: r.service_id, entityId: r.entity_id, entityTitle: r.entity_title, createdAt: r.created_at }
        return { id: e.id, kind: e.kind, text: activityText(e, names), serviceId: e.serviceId, createdAt: e.createdAt }
      }),
    }
  } catch (error) {
    return { success: false, errors: [error instanceof ApiError && error.status !== 0 ? error.message : 'Disponível com conexão.'] }
  }
}
