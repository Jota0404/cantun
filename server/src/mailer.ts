import type { FastifyBaseLogger } from 'fastify'

export interface Mail {
  to: string
  purpose: 'verify_email' | 'reset_password' | 'assignment_invite'
  link: string
  /** Só em `assignment_invite`: o mínimo do ADR-054 (pessoa, função, serviço, data e hora). */
  invite?: { name: string; musicalFunction: string; service: string; startsAt: Date }
}

export interface Mailer {
  send(mail: Mail): Promise<void>
}

/**
 * Só para desenvolvimento: registra o link no log, sem o e-mail do destinatário.
 * Em produção o servidor exige o Brevo (`brevoMailer`, ADR-060).
 */
export function devMailer(log: FastifyBaseLogger): Mailer {
  return {
    async send({ purpose, link }) {
      log.info({ purpose, link }, 'e-mail de desenvolvimento')
    },
  }
}

const SUBJECTS: Record<Mail['purpose'], string> = {
  verify_email: 'Confirme seu e-mail no CANTUM',
  reset_password: 'Redefinição de senha do CANTUM',
  assignment_invite: 'Você foi escalado no CANTUM',
}

const BODIES: Record<Mail['purpose'], string> = {
  verify_email: 'Para confirmar seu e-mail, abra o link abaixo (vale por 24 horas):',
  reset_password: 'Para criar uma nova senha, abra o link abaixo (vale por 1 hora). Se você não pediu, ignore este e-mail.',
  assignment_invite: 'Para ver e responder ao convite, entre no CANTUM pelo link abaixo (é preciso fazer login):',
}

const FUNCTION_LABELS: Record<string, string> = {
  vocals: 'vocal', 'electric-guitar': 'guitarra', 'acoustic-guitar': 'violão', bass: 'baixo', drums: 'bateria',
  keys: 'teclado', piano: 'piano', strings: 'cordas', brass: 'metais', woodwinds: 'madeiras', other: 'outra função',
}

function inviteSummary({ name, musicalFunction, service, startsAt }: NonNullable<Mail['invite']>): string {
  const when = startsAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' })
  return `Olá, ${name}. Você foi convidado(a) para ${FUNCTION_LABELS[musicalFunction] ?? musicalFunction} no serviço "${service}", ${when}.\n\n`
}

export interface BrevoOptions {
  apiKey: string
  /** `email@dominio` ou `Nome <email@dominio>`; precisa ser um remetente verificado no Brevo. */
  from: string
  fetch?: typeof fetch
}

/** E-mail transacional pela API do Brevo (ADR-060). Nunca registra a chave nem o link. */
export function brevoMailer({ apiKey, from, fetch: send = fetch }: BrevoOptions): Mailer {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from)
  const sender = match ? { name: match[1] || 'CANTUM', email: match[2] } : { name: 'CANTUM', email: from.trim() }
  return {
    async send({ to, purpose, link, invite }) {
      const response = await send('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender,
          to: [{ email: to }],
          subject: SUBJECTS[purpose],
          textContent: `${invite ? inviteSummary(invite) : ''}${BODIES[purpose]}\n\n${link}\n`,
        }),
      })
      if (!response.ok) throw new Error(`Brevo recusou o envio (HTTP ${response.status})`)
    },
  }
}
