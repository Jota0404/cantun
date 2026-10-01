# B4 — Escala (VS-03)

> Fase 1 · Esforço: 4–6 semanas · Depende de: B3 · Requisitos: RF-SCH-001…005, RF-TEAM-005 · Blueprint §8.3, §8.4, §12.2, §18.5, §34.1 (ex. 1), §51, §53, §54, §62

## Objetivo
O líder define as **vagas** do serviço, escala pessoas, vê **lacunas** na hora e resolve substituições; cada membro **confirma ou recusa** a própria escala e sabe exatamente o que fazer.

## Estado atual
- `Assignment { serviceId, userId (obrigatório), musicalFunction (texto livre), serviceItemId?, status: 'pending'|'accepted'|'declined' }`.
- RLS: só owner/admin escrevem `assignments`; **o membro não consegue confirmar a própria escala**.
- Não existem disponibilidade, notificações nem visão do membro.

## Decisões
- **ADR-053 — Vagas e atribuições (D3):**
  - `service_positions (id, service_id, musical_function, quantity ≥ 1, notes, position)`.
  - `assignments.position_id` (obrigatório nos registros novos), `status`: `invited | confirmed | declined | replacement_needed | cancelled`, `responded_at`, `replaced_assignment_id?`.
  - Status da vaga é **derivado**: `open` se confirmados < quantidade, senão `filled`.
  - Migração: cada combinação (service, função) antiga vira uma vaga; `pending → invited`, `accepted → confirmed`.
  - RPCs: `respond_to_assignment(id, 'confirm'|'decline')` (só o titular), `request_replacement`, `replace_assignment` (líder).
- **ADR-057 — Consistência por entidade:** confirmar/recusar é "offline com autoridade" (só o titular; o servidor valida; vence o titular). Convites e mudança de papel são online-only. O resto segue com LWW.
- **ADR-054 — Canal de notificação** (bloqueio B3 da auditoria): a proposta é e-mail transacional + **link de confirmação** que o líder pode compartilhar uma vez no WhatsApp + Web Push opcional (iOS só com PWA instalado). Nada de chat (§18.8). O provedor de e-mail precisa ser portável (D4).

## Escopo

**Entra:**
1. Spec `docs/specs/VS-03-escala.md` + ADR-053, 054, 057.
2. Migration: `service_positions`, colunas novas em `assignments`, migração de dados, RPCs, RLS (líder escreve vagas e atribuições da sua equipe; membro só responde a si mesmo).
3. **Disponibilidade** simples: `member_availability (user_id, organization_id, date, status: available|unavailable|tentative, note)`. Sem calendário pessoal (§8.4). Na escala, sugerir pessoas disponíveis com a função.
4. Domínio: regras de estado, cálculo de lacuna, sugestão de substitutos (função + disponibilidade + não escalado no mesmo horário).
5. Application: `definePositions`, `assignMember`, `respondToAssignment`, `requestReplacement`, `replaceAssignment`, `setAvailability`.
6. Dexie + sync (respeitando o ADR-057).
7. UI do líder: aba **Escala** do serviço com vagas, pessoas, estados e lacunas destacadas (não depender só de cor); substituição em 2 cliques.
8. UI do membro: **"Meus próximos serviços"** com função, horário, local, músicas, botão confirmar/recusar e marcação de disponibilidade.
9. Notificação mínima: convite para escala + lembrete de confirmação pendente, pelo canal do ADR-054.
10. Indicador de lacunas no Início (provisório até o B5).

**Não entra:** automação/rodízio (Fase 4), templates de funções (Fase 4), Network (B10).

## Entregáveis por PR
1. `docs/vs-03-spec` (spec + 3 ADRs) · 2. `feat/schedule-schema` · 3. `feat/schedule-domain` · 4. `feat/availability` · 5. `feat/schedule-leader-ui` · 6. `feat/my-services` · 7. `feat/schedule-notifications`.

## Critérios de aceite (Blueprint §34.1, ex. 1)
- Atribuição `invited` pode ser confirmada ou recusada **apenas** pelo membro atribuído.
- Confirmar → `confirmed`; recusar → `declined` e a vaga volta a mostrar lacuna para o líder.
- O membro não altera a atribuição de outra pessoa (negado no banco).
- O serviço mostra quantas vagas estão abertas e quais.
- O membro vê em uma tela: onde, quando, qual função, quais músicas e se confirmou (§18.5).
- A confirmação feita offline sobe quando a conexão volta, sem sobrescrever decisões do líder indevidamente (ADR-057).

## Testes
Unit (estados, lacuna, sugestão), RLS (titular × outro membro × líder de outra equipe), integração offline/online da confirmação, UI do líder e do membro, notificação com provedor mockado.

## Riscos
- Migração de atribuições antigas com função em texto livre → normalizar para as funções da equipe e registrar o que não casar.
- Notificação depender de um provedor caro ou não portável → manter atrás de uma interface (`NotificationGateway`).
