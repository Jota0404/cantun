// Convite de escala por e-mail (ADR-054). O e-mail leva só um link para o app (/meus-servicos),
// que exige login: nada confirma sem autenticar. A autorização, o limite de um envio por minuto
// no reenvio e a reivindicação atômica dos convites automáticos vivem no banco
// (app.assignment_invite_mail e app.claim_pending_invites).
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { Pool } from './db.ts'
import { asUser, HttpError } from './db.ts'
import type { Mailer } from './mailer.ts'

interface InviteRow {
  assignment_id?: string
  email: string
  display_name: string
  musical_function: string
  service_name: string
  starts_at: Date
}

/** Nunca lança: falha do provedor é registrada (sem endereço nem link) e o fluxo segue. Devolve se enviou. */
async function sendInvite(mailer: Mailer, appOrigin: string, log: FastifyBaseLogger, invite: InviteRow): Promise<boolean> {
  try {
    await mailer.send({
      to: invite.email, purpose: 'assignment_invite', link: `${appOrigin}/meus-servicos`,
      invite: { name: invite.display_name, musicalFunction: invite.musical_function, service: invite.service_name, startsAt: invite.starts_at },
    })
    return true
  } catch (error) {
    log.error({ purpose: 'assignment_invite', err: { message: (error as Error).message } }, 'falha ao enviar e-mail')
    return false
  }
}

/**
 * Gancho pós-RPC: depois do commit de `transition_service` (serviço sai de draft), de
 * `assign_member` e de `replace_assignment` (serviço já fora de draft), envia os convites ainda
 * sem envio. O banco reivindica cada atribuição uma vez só (invite_sent_at), então não duplica
 * nem em corrida. Os e-mails saem em paralelo (cada fetch tem timeout); se um falhar, o convite
 * volta à fila (app.release_invite) para a próxima oportunidade (ADR-054 §3).
 */
export function inviteHook(pool: Pool, mailer: Mailer, appOrigin: string) {
  return async ({ name, userId, row, log }: { name: string; userId: string; row: Record<string, unknown> | null; log: FastifyBaseLogger }) => {
    const serviceId = name === 'transition_service' ? row?.id : name === 'assign_member' || name === 'replace_assignment' ? row?.service_id : null
    if (typeof serviceId !== 'string') return
    const invites = await asUser(pool, userId, async (client) =>
      (await client.query<InviteRow>('select * from app.claim_pending_invites($1)', [serviceId])).rows)
    const results = await Promise.allSettled(invites.map(async (invite) => {
      if (await sendInvite(mailer, appOrigin, log, invite)) return
      await asUser(pool, userId, (client) => client.query('select app.release_invite($1)', [invite.assignment_id]))
    }))
    for (const result of results) {
      if (result.status === 'rejected') log.error({ err: { message: String(result.reason?.message ?? result.reason) } }, 'falha ao devolver convite à fila')
    }
  }
}

export async function scheduleRoutes(app: FastifyInstance, { pool, mailer, appOrigin }: { pool: Pool; mailer: Mailer; appOrigin: string }) {
  app.post<{ Params: { id: string } }>('/schedule/assignments/:id/resend-invite', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: { params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } },
  }, async (request, reply) => {
    const userId = request.userId
    if (!userId) throw new HttpError(401, 'sessão inválida')
    let invite: InviteRow | undefined
    try {
      invite = await asUser(pool, userId, async (client) =>
        (await client.query<InviteRow>('select * from app.assignment_invite_mail($1)', [request.params.id])).rows[0])
    } catch (error) {
      if ((error as Error).message === 'invite sent recently') throw new HttpError(429, 'convite reenviado há pouco; tente de novo em 1 minuto')
      throw error
    }
    if (!invite) throw new HttpError(404, 'atribuição não encontrada')
    // Falha do provedor não desfaz nada nem vira 500: o Líder tenta de novo em 1 minuto.
    await sendInvite(mailer, appOrigin, request.log, invite)
    return reply.code(204).send()
  })
}
