import type { FastifyBaseLogger } from 'fastify'

export interface Mail {
  to: string
  purpose: 'verify_email' | 'reset_password'
  link: string
}

export interface Mailer {
  send(mail: Mail): Promise<void>
}

/**
 * Só para desenvolvimento: registra o link no log, sem o e-mail do destinatário.
 * O provedor real é escolhido junto com a hospedagem (ADR-059).
 */
export function devMailer(log: FastifyBaseLogger): Mailer {
  return {
    async send({ purpose, link }) {
      log.info({ purpose, link }, 'e-mail de desenvolvimento')
    },
  }
}
