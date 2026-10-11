# B4 — Escala (VS-03)

> Fase 1 · Esforço: 4–6 semanas · Depende de: B3, B1 (Render + Neon, e-mail Brevo) · Spec: [`VS-03-escala.md`](../specs/VS-03-escala.md) · Requisitos: RF-SCH-001…005, RF-TEAM-005 · Blueprint §8.3, §8.4, §12.2, §18.5, §34.1 (ex. 1), §51, §53, §54, §62

## Objetivo
O líder define as **vagas** do serviço, escala pessoas, vê **lacunas** na hora e resolve substituições; cada membro **confirma ou recusa** a própria escala e sabe exatamente o que fazer.

## Estado atual
- `Assignment { serviceId, userId, musicalFunction (texto livre), serviceItemId?, status: 'pending'|'accepted'|'declined' }`; a escala da `ServiceDetailPage` é provisória (`window.prompt`, `userId` cru) e deve ser substituída.
- RLS: só owner/admin escrevem `assignments`; **o membro não consegue confirmar a própria escala**.
- O Stage lê `assignments` em `get_service_stage_songs` (`pending`/`accepted`).
- Não existem disponibilidade, vagas, notificações nem visão do membro.

## Decisões
- **ADR-053 — Vagas e atribuições (D3)** (`Proposed`):
  - `service_positions (id, service_id, musical_function, quantity 1..20, notes)`, uma por função e serviço.
  - `assignments.position_id not null`, `status`: `invited | confirmed | declined | replacement_needed | cancelled`, `responded_at`, `replaced_assignment_id?`.
  - Status da vaga é **derivado**: `open` se confirmados < quantidade, senão `filled`.
  - Migração (só dev, ADR-059 §1): cada combinação (service, função) antiga vira uma vaga; `pending → invited`, `accepted → confirmed`.
  - Escrita direta em `assignments` bloqueada; RPCs: `assign_member`, `respond_to_assignment(id, 'confirm'|'decline')` (só o titular), `request_replacement`, `replace_assignment`, `cancel_assignment`.
- **ADR-057 — Consistência por entidade** (`Proposed`): três classes — A (LWW offline), B (autoridade do servidor, **só online** via RPC) e C (efêmero). **Mudou em relação ao rascunho:** confirmar/recusar/substituir é classe B (só online, sem fila), como papel/status (B2) e status do serviço (B3). Vagas e disponibilidade são LWW.
- **ADR-054 — Canal de notificação** (`Proposed`, curto): e-mail transacional pelo Brevo (já existe) atrás de `NotificationGateway`, com outbox na mesma transação; **link direto para o app** (exige login, sem token que confirme sem autenticar); sem lembrete agendado no primeiro corte (o Render dorme; "Reenviar convite" manual); Web Push depois. Nada de chat (§18.8).

## Escopo

**Entra:**
1. Spec `docs/specs/VS-03-escala.md` + ADR-053, 054, 057.
2. Migration `db/migrations/0006_schedule.sql`: `service_positions`, colunas novas em `assignments`, migração de dados, RPCs, RLS (líder escreve vagas e atribuições da sua equipe; membro só responde a si mesmo).
3. **Disponibilidade** simples: `member_availability (user_id, organization_id, date, status: available|unavailable|tentative, note)`, visível só ao próprio e aos gestores da equipe. Sem calendário pessoal (§8.4). Na escala, sugerir pessoas disponíveis com a função.
4. Domínio: regras de estado, cálculo de lacuna, sugestão de substitutos (função + disponibilidade + não escalado no mesmo horário).
5. Application: `definePositions`, `assignMember`, `respondToAssignment`, `requestReplacement`, `replaceAssignment`, `setAvailability`.
6. Dexie `version(14)` + sync (ADR-057): vagas e disponibilidade LWW; `assignments` só pull.
7. UI do líder: aba **Escala** do serviço com vagas, pessoas, estados e lacunas destacadas (não depender só de cor); substituição em 2 cliques.
8. UI do membro: **"Meus próximos serviços"** com função, horário, local, músicas, botão confirmar/recusar e marcação de disponibilidade.
9. Notificação mínima: convite para escala + lembrete de confirmação pendente, pelo canal do ADR-054.
10. Indicador de lacunas no Início (provisório até o B5).

**Não entra:** automação/rodízio (Fase 4), templates de funções (Fase 4), Network (B10).

## Entregáveis por PR
1. `docs/vs-03-spec` (spec + ADR-053, 054, 057) · 2. `feat/schedule-schema` · 3. `feat/schedule-domain` · 4. `feat/availability` · 5. `feat/schedule-leader-ui` · 6. `feat/my-services` · 7. `feat/schedule-notifications`.

## Critérios de aceite (Blueprint §34.1, ex. 1)
- Atribuição `invited` pode ser confirmada ou recusada **apenas** pelo membro atribuído.
- Confirmar → `confirmed`; recusar → `declined` e a vaga volta a mostrar lacuna para o líder.
- O membro não altera a atribuição de outra pessoa (negado no banco).
- O serviço mostra quantas vagas estão abertas e quais.
- O membro vê em uma tela: onde, quando, qual função, quais músicas e se confirmou (§18.5).
- Sem rede, confirmar/recusar mostra "Sem conexão: tente de novo quando estiver online." e nada muda (ADR-057); vagas e disponibilidade editam offline.

## Testes
Unit (estados, lacuna, sugestão), RLS (titular × outro membro × líder de outra equipe), integração da confirmação (online, sem rede), UI do líder e do membro, notificação com provedor mockado.

## Riscos
- Migração de atribuições antigas com função em texto livre → normalizar para as funções da equipe e registrar o que não casar.
- Notificação depender de um provedor caro ou não portável → manter atrás de uma interface (`NotificationGateway`).
- Lembrete agendado não roda com o Render dormindo → reenvio manual no primeiro corte (ADR-054).
