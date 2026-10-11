// Reenvio do convite de escala por e-mail (ADR-054). O e-mail leva só um link para o app
// (/meus-servicos), que exige login: nada confirma sem autenticar. A autorização e o limite de
// um envio por minuto por atribuição vivem em app.assignment_invite_mail, no banco.
import type { FastifyInstance } from 'fastify'
import type { Pool } from './db.ts'
import { asUser, HttpError } from './db.ts'
import type { Mailer } from './mailer.ts'

interface InviteRow {
  email: string
  display_name: string
  musical_function: string
  service_name: string
  starts_at: Date
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
    // O log não leva endereço nem link.
    try {
      await mailer.send({
        to: invite.email, purpose: 'assignment_invite', link: `${appOrigin}/meus-servicos`,
        invite: { name: invite.display_name, musicalFunction: invite.musical_function, service: invite.service_name, startsAt: invite.starts_at },
      })
    } catch (error) {
      request.log.error({ purpose: 'assignment_invite', err: { message: (error as Error).message } }, 'falha ao enviar e-mail')
    }
    return reply.code(204).send()
  })
}
