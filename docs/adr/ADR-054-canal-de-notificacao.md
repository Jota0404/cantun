# ADR-054 — Canal de notificação da escala

- **Status:** Proposed (proposta curta)
- **Data:** 2026-10-11
- **Decisor:** Jota (owner)
- **Escopo:** Comunicação operacional (Blueprint §54)
- **Bloco:** B4 (VS-03), PR `feat/schedule-notifications`
- **Relacionados:** ADR-050, ADR-053, ADR-059, ADR-060 · Spec: [`docs/specs/VS-03-escala.md`](../specs/VS-03-escala.md)

## Contexto

O Blueprint §54 pede mensagens que sejam consequência de eventos do sistema ("Você foi escalado para Teclado"), nunca chat (§18.8). O servidor já envia e-mail transacional pela API do Brevo (verificação e redefinição de senha, ADR-060). O Render Free dorme após 15 min sem tráfego, então nada agendado roda enquanto ele dorme.

## Decisão (proposta)

1. **Canal inicial: e-mail transacional** pelo mailer existente, atrás de uma interface `NotificationGateway` (portável, D4).
2. **Eventos:** convite para a escala (ao ser convidado, se o serviço não é `draft`; os convites pendentes saem ao passar a `ready`); recusa e pedido de substituição (aviso aos gestores da equipe).
3. **Outbox:** a RPC grava o evento em `notification_outbox` **na mesma transação** da mudança de estado; o servidor envia após o commit e marca como enviado. Falha de envio nunca desfaz a escala e é repetida na próxima oportunidade.
4. **Link:** o e-mail leva um **link direto** para o app (`/meus-servicos`), que exige login. Sem token de uso único que confirme sem autenticar.
5. **Sem lembrete agendado** no primeiro corte (o serviço dorme); o Líder tem o botão "Reenviar convite". Lembrete automático só com agendador confiável ou hospedagem sempre ativa.
6. **Conteúdo mínimo:** nome da pessoa, função, serviço, data e hora, link. Sem dados de terceiros.
7. **Fora:** Web Push (iOS só com PWA instalado; depois), SMS, WhatsApp, chat e preferências finas.

## Alternativas consideradas

- **Web Push já:** exige service worker de push, permissão e PWA no iOS; adiado.
- **Link mágico que confirma sem login:** conveniente, mas é um bypass de autenticação para uma ação pessoal; rejeitado.
- **Lembrete por cron externo / pinger:** acordaria o Render e gastaria a cota do Neon (ADR-060); rejeitado.

## Consequências

- Cota diária do plano gratuito do Brevo (não verificada) limita o volume; confirmar antes do primeiro usuário real.
- O Brevo é adaptador substituível; trocar de provedor muda só o gateway.
- Dado pessoal (e-mail) em provedor terceiro entra na revisão de LGPD do B8.
