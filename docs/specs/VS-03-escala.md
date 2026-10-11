# Feature Spec — VS-03 Escala: vagas, atribuições e disponibilidade

- **Status:** Em revisão
- **Bloco:** B4 (`docs/blocks/B4-escala-vs03.md`)
- **Fatia vertical:** VS-03
- **Autor / data:** Claude Code (planner), sob revisão do Jota · 2026-10-11
- **Decisões associadas:** [ADR-053](../adr/ADR-053-vagas-e-atribuicoes.md), [ADR-057](../adr/ADR-057-consistencia-por-entidade.md), [ADR-054](../adr/ADR-054-canal-de-notificacao.md) (todos `Proposed`) · Matriz: [`docs/PERMISSIONS.md`](../PERMISSIONS.md) §3.5 e §5.2 · Base: ADR-051, ADR-052, ADR-059

## Feature
O Líder define as **vagas** do serviço (função + quantidade), escala pessoas da equipe, vê as **lacunas** e resolve substituições. Cada membro vê "meus próximos serviços", **confirma ou recusa** a própria escala e informa sua **disponibilidade** por data, que apoia as sugestões do Líder (Blueprint §8.3, §8.4, §12.2, §18.5, §54).

## Objetivo
Fechar o ciclo "o serviço precisa de quem → quem foi chamado → quem confirmou → o que falta". Sustenta o Blueprint §26 (itens 3 e 4: cada músico sabe o que fazer; menos dependência de WhatsApp e planilhas). Substitui a escala **provisória** do B3 (`window.prompt` e `userId` cru em `ServiceDetailPage`).

## User Stories
- Como **Líder**, quero definir as funções necessárias no serviço e quantas pessoas cada uma exige, para saber o que falta.
- Como **Líder**, quero escalar membros da minha equipe numa vaga, vendo quem está disponível e tem aquela função, para convidar a pessoa certa.
- Como **Líder**, quero ver na hora as vagas abertas e quem recusou, e trocar uma pessoa em poucos cliques, para resolver a lacuna.
- Como **Owner/Admin**, quero fazer o mesmo em qualquer equipe.
- Como **Membro**, quero ver meus próximos serviços com data, local, função e músicas, e confirmar ou recusar, para o Líder saber com quem conta.
- Como **Membro**, quero pedir substituição depois de confirmar, para avisar cedo que não poderei ir.
- Como **Membro**, quero marcar datas disponíveis, indisponíveis ou "talvez", para não ser chamado quando não posso.
- Como **Membro**, quero ver quem mais está escalado, para saber com quem toco.

## Regras de negócio
- **RN-01** A **vaga** (`ServicePosition`) é serviço + função musical + quantidade (1–20) + observação. Uma função por serviço (`unique (service_id, musical_function)`); mais pessoas na mesma função = quantidade maior. Funções são as de `team_musical_functions` (`vocals`, `electric-guitar`, `acoustic-guitar`, `bass`, `drums`, `keys`, `piano`, `strings`, `brass`, `woodwinds`, `other`).
- **RN-02** A **atribuição** (`Assignment`) liga uma pessoa a uma vaga. A pessoa precisa ser **membro ativo da equipe do serviço** (`services.team_id`). Mesma pessoa em duas vagas do mesmo serviço é permitida (ex.: vocal e violão).
- **RN-03** Estados da atribuição (ADR-053): `invited → confirmed | declined`; `confirmed → replacement_needed`; `invited | confirmed | replacement_needed → cancelled`. `declined` e `cancelled` são finais. Serviço novo não tem vagas.
- **RN-04** Só o **titular** (`assignments.user_id`) confirma ou recusa. Nem Owner, Admin nem Líder respondem por outra pessoa.
- **RN-05** `replacement_needed` é pedido pelo titular (depois de confirmar) ou pelo Líder. A atribuição deixa de contar como preenchida e a vaga reabre; o Líder resolve por `replace_assignment` (cria a nova atribuição `invited` ligada à anterior, que vira `cancelled`) ou cancela.
- **RN-06** Estado da vaga é **derivado**, nunca gravado: `filled` se `confirmed ≥ quantity`, senão `open`. A lacuna é `quantity − confirmed`; a interface separa "convidados aguardando" de "sem convite" (não depender só de cor).
- **RN-07** Toda mudança de estado da atribuição é **só online, por RPC**, sem fila offline (ADR-057): sem rede, mostra "Sem conexão: tente de novo quando estiver online." e nada muda localmente. O pull é autoritativo.
- **RN-08** Serviço `completed` ou `cancelled` não aceita vagas, atribuições nem respostas. Passar o serviço a `cancelled` não altera as atribuições (histórico).
- **RN-09** A quantidade da vaga não pode ficar abaixo das atribuições ativas (`invited` + `confirmed`); a vaga com atribuição ativa não é excluída (cancelar antes).
- **RN-10** **Disponibilidade** é por membro e **dia** (`date`): `available | unavailable | tentative`, nota opcional (até 200 caracteres). Sem calendário pessoal nem recorrência (§8.4). O dia vale para todos os serviços daquela data.
- **RN-11** A disponibilidade e a nota só são visíveis ao próprio membro e a Owner, Admin e Líderes ativos de uma equipe da qual ele é membro. Outros membros não a veem. Ela **sugere**, nunca bloqueia: o Líder pode convidar quem marcou indisponível, com aviso.
- **RN-12** Sugestão (função pura `suggestMembers`): candidatos = membros ativos da equipe, sem atribuição ativa naquela vaga e que não recusaram a mesma vaga; ordem: tem a função e `available` › tem a função e `tentative` › tem a função sem resposta › sem a função; `unavailable` ao fim, marcado; quem já tem atribuição ativa em outro serviço com o mesmo `starts_at` leva o aviso "já escalado neste horário".
- **RN-13** O membro vê as atribuições de todos os membros do serviço (quem toca o quê), exceto a disponibilidade (RN-11). *Proposta; decisão do owner.*
- **RN-14** Notificação (ADR-054, proposta): evento do sistema por e-mail ao convidado e ao Líder quando alguém recusa ou pede substituição; sem chat.
- **RN-15** Permissões pela matriz (`PERMISSIONS.md` §3.5), decididas no banco por `app.has_permission`; `permissions.ts` só espelha (NFR-005).

## Acceptance Criteria
- [ ] O Líder define vagas (função + quantidade) no serviço da própria equipe; o Líder de outra equipe e o Membro não (negado pelo banco).
- [ ] O Líder convida um membro ativo da equipe; a atribuição nasce `invited`. Pessoa fora da equipe ou `inactive` é recusada.
- [ ] Só o titular confirma ou recusa; confirmar vai a `confirmed`, recusar a `declined`, e a vaga mostra a lacuna ao Líder.
- [ ] O membro não altera a atribuição de outra pessoa; escrita direta em `assignments` é negada, por qualquer papel.
- [ ] Transição inválida (ex.: `declined → confirmed`) é recusada no domínio e no banco.
- [ ] Depois de confirmar, o titular pede substituição; o Líder substitui em até 2 interações a partir da vaga, e a anterior fica `cancelled`.
- [ ] O serviço mostra quantas vagas estão abertas e quais, com texto (não só cor), na tela do serviço e no Início.
- [ ] Sem rede, confirmar, recusar ou pedir substituição mostra o aviso de conexão e não muda nada; vagas e disponibilidade ainda editam offline (fila LWW).
- [ ] O membro vê, em uma tela, onde, quando, função, músicas e se confirmou (§18.5).
- [ ] A sugestão ordena e avisa conforme RN-12; a disponibilidade de outro membro nunca aparece para membro comum.
- [ ] A escala provisória do B3 (prompts, `userId` cru) sai; nomes vêm de `get_organization_member_profiles`.
- [ ] Serviço `completed`/`cancelled` não aceita mudanças de escala.

## Requisitos
| ID | Descrição | Origem |
|---|---|---|
| RF-SCH-001 | Definir posições/funções necessárias. | Blueprint §28 |
| RF-SCH-002 | Atribuir pessoas às posições. | Blueprint §28 |
| RF-SCH-003 | Confirmação ou recusa. | Blueprint §28 |
| RF-SCH-004 | Identificar posições não preenchidas. | Blueprint §28 |
| RF-SCH-005 | Suportar substituição. | Blueprint §28 |
| RF-TEAM-005 | Informar disponibilidade para serviços. | Blueprint §28 |
| NFR-001 | Leitura offline da escala e das vagas. | Blueprint §29 |
| NFR-004 | Acessibilidade: lacuna não depende só de cor. | Blueprint §29 |
| NFR-005 | Permissão no banco. | Blueprint §29, §49–50 |

Rastreio: RF-SCH-001 → RN-01, RN-09; RF-SCH-002 → RN-02, RN-12; RF-SCH-003 → RN-03, RN-04, RN-07; RF-SCH-004 → RN-06; RF-SCH-005 → RN-05; RF-TEAM-005 → RN-10, RN-11.

## Impacto em domínio, arquitetura e dados

### Domínio
- `src/domain/services/servicePosition.ts` (`ServicePosition { id, serviceId, musicalFunction, quantity, notes?, createdAt, updatedAt }`), `assignment.ts` substitui o modelo atual: `status: 'invited' | 'confirmed' | 'declined' | 'replacement_needed' | 'cancelled'`, `positionId`, `respondedAt?`, `replacedAssignmentId?`; `musicalFunction` deixa de ser campo editável (vem da vaga).
- `assignmentLifecycle.ts`: tabela de transições e de quem pode (titular × gestor), pura.
- `positionGap.ts`: `confirmed`, `invited`, `missing`, `state` (`open | filled`) por vaga; `serviceGaps(service)`.
- `suggestMembers.ts` (RN-12) e `memberAvailability.ts` (`MemberAvailability { id, userId, organizationId, date, status, note? }`).
- Respeita `AI_CONTEXT.md` §6: papel ≠ função; Service ≠ StageSession; Arrangement fora.

### Arquitetura
- `domain` → `application/schedule` (`definePositions`, `assignMember`, `respondToAssignment`, `requestReplacement`, `replaceAssignment`, `cancelAssignment`, `setAvailability`) → UI. Padrão `fn(input, repository = default)` com `{ success, errors }`.
- Remoto via `src/platform` (RPCs online) e `TargetSyncEngine` (vagas e disponibilidade). Nenhum import de `src/lib/supabase`.
- ADRs: ADR-053 (vagas/atribuições), ADR-057 (consistência por entidade), ADR-054 (notificação, proposta curta), ADR-051/052, ADR-059, ADR-026 (refinado pelo 057), D6 (Stage).

### Consumidores a mapear (mudança de `assignments`)
- SQL: `get_service_stage_songs` (hoje `a.status in ('pending','accepted')` e `a.musical_function`) passa a `('invited','confirmed')` e à função da vaga; é o único ajuste do Stage (D6, sem feature nova). Políticas "organization admins can write assignments" e "…members can read assignments" são substituídas.
- Cliente: `src/domain/services/assignment.ts`, `src/db/repositories/assignmentRepository.ts`, `src/application/services/serviceService.ts` (`createAssignment`, `updateAssignment`, `removeAssignment`, `listServiceAssignments`), `src/sync/targetSyncEngine.ts` (mapeamento de `assignments`), `src/application/stage/getServiceStageSongs.ts`, `src/pages/Organization/ServiceDetailPage.tsx` (escala provisória), `src/db/database.ts`.

### Dados
- **SQL (`db/migrations/0006_schedule.sql`, próximo número livre; nada em `supabase/migrations`):**
  - `service_positions (id, service_id → services on delete cascade, musical_function check (11 valores), quantity int check (1..20), notes, created_at, updated_at, unique (service_id, musical_function))`. RLS: leitura por membro ativo da organização; escrita por `app.has_permission(org, services.team_id, 'schedule.manage')`; serviço final bloqueia; trigger de guarda impede `quantity` abaixo das atribuições ativas e exclusão com atribuição ativa (RN-09).
  - `assignments`: `position_id uuid not null → service_positions on delete restrict`, novo `check` de status (`invited, confirmed, declined, replacement_needed, cancelled`), `responded_at timestamptz`, `replaced_assignment_id uuid → assignments`. `unique (position_id, user_id) where status in ('invited','confirmed','replacement_needed')`. `musical_function` permanece (NOT NULL) e é preenchida pela RPC a partir da vaga; trigger garante igualdade. `service_item_id` fica como está.
  - **Migração (só bancos de desenvolvimento, ADR-059 §1):** cada `(service_id, musical_function)` vira vaga com `quantity` = número de atribuições; função fora da lista vira `other`; `pending → invited`, `accepted → confirmed`; `declined` igual.
  - **Escrita direta bloqueada:** `revoke insert, update, delete on assignments from cantum_user`; só `select` (RLS). RPCs `security definer`, `set search_path = ''`: `assign_member(p_position_id, p_user_id)`, `respond_to_assignment(p_assignment_id, p_response)` (`'confirm'|'decline'`, só o titular, ativo), `request_replacement(p_assignment_id)` (titular ou gestor), `replace_assignment(p_assignment_id, p_new_user_id)`, `cancel_assignment(p_assignment_id)`. Todas validam transição (RN-03), serviço não final (RN-08), titular/gestor ativo e membro ativo da equipe (RN-02).
  - `member_availability (id, user_id, organization_id, date, status check, note ≤ 200, updated_at, unique (user_id, organization_id, date))`. RLS: escreve só o próprio (ativo na organização); lê o próprio ou quem passa em `app.can_read_availability(user_id, organization_id)` (Owner, Admin, Líder ativo de equipe da qual o alvo é membro).
  - `app.has_permission` ganha `schedule.manage` (equipe do serviço) e `availability.set_own` (organização, ativo). `app.can_read_availability` como acima.
  - Leitura de `assignments` e `service_positions`: membro **ativo** da organização (RN-13).
- **Dexie:** nova `this.version(14)` (a v13 é do B3; confirmar no PR): `servicePositions: 'id, serviceId, musicalFunction, updatedAt'`, `memberAvailability: 'id, userId, organizationId, date, updatedAt, [organizationId+date]'`, `assignments: 'id, serviceId, userId, positionId, status, updatedAt'`. `upgrade()`: `pending → invited`, `accepted → confirmed`, `positionId` nulo (o pull corrige). Teste de upgrade v13 → v14.
- **Sync (ADR-057):** `servicePositions` e `memberAvailability` são **LWW** com fila (push + pull). `assignments` é **somente pull** (autoridade do servidor); o cliente nunca faz push de `assignments`. Vagas sobem depois do serviço. Respostas e substituições usam `src/platform` online; o estado local só muda com a resposta da RPC ou com o pull.
- **Notificação:** ver ADR-054 (fora dos dados do domínio; usa `notification_outbox` no servidor).
- **RLS / permissões:** `PERMISSIONS.md` §3.5 e casos E1–E12 em §5.2; a UI não é mecanismo de segurança.

## Fora do escopo
- Automação ou rodízio de escala, templates de funções (Fase 4); Network / `ServiceNeed` (B10).
- Chat ou comentários na escala (§18.8); Web Push (ADR-054, depois).
- Disponibilidade recorrente, calendário pessoal, preferências futuras (§8.4).
- Vincular a atribuição a um item da ordem (`service_item_id` segue sem UI).
- Materiais e ensaio na visão do membro (B6; placeholders).
- Horário de término do serviço e fuso por organização (RN-12 compara `starts_at` exato; datas em `America/Sao_Paulo`).

## Plano de testes
- **Domínio / application:** todas as transições e quem pode; `positionGap`; `suggestMembers` (ordem, exclusões, avisos); validação de vaga; casos de uso com sucesso e `errors`.
- **Repositórios (fake-indexeddb):** upgrade v13 → v14; índices; `assignments` sem push.
- **Sync:** `toRow`/`fromRow` de vagas e disponibilidade; fila LWW; `assignments` só no pull; RPC online sem fila (rede ausente não altera o estado; `src/platform` mockado).
- **UI (papel/label):** aba Escala do Líder (vagas, convite com sugestões, lacunas em texto, substituição em 2 cliques); "Meus próximos serviços" (confirmar/recusar, aviso sem conexão); disponibilidade por teclado; bloqueio em serviço final.
- **RLS / SQL (`scripts/db`):** titular × outro membro × Líder da equipe × Líder de outra equipe × Admin × outra organização × anônimo × `inactive`; casos E1–E12; migração de dados antigos; `unique` parcial; trigger de quantidade; leitura de disponibilidade.
- **Server:** RPCs na allowlist de `/rpc`; notificação com gateway mockado.
- **Regressão do Stage:** `musical_role` do Palco vem da vaga confirmada ou convidada.
- **Manual:** celular/tablet; sem rede (confirmar bloqueado com aviso, vagas offline); dois aparelhos (Líder e músico).

## Riscos
| Risco | Mitigação |
|---|---|
| Migração de função em texto livre | Dev-only; normaliza para as 11 funções, o resto vira `other`, listado no PR |
| Confirmar só online prende o músico sem rede (ex.: igreja sem sinal) | Aceito pelo padrão (ADR-057); a atribuição permanece `invited` e o Líder vê "aguardando"; reavaliar se o uso mostrar dor |
| Lembrete agendado não roda com o Render dormindo | ADR-054: sem lembrete agendado no primeiro corte; reenvio manual pelo Líder; gatilho de hospedagem (ADR-060) |
| Disponibilidade por dia ignora serviços no mesmo dia e o fuso | Limite registrado; data em `America/Sao_Paulo`; ampliar quando houver necessidade real |
| Exposição de privacidade da disponibilidade e da nota | RLS por `can_read_availability`; teste E10; nota só para gestores |
| Conflito de horário só por `starts_at` exato | Apenas aviso; refinar com término do serviço |
| Ajuste do Stage vira feature (D6) | Só trocar status e a origem da função em `get_service_stage_songs` |
| Corrida: dois Líderes alteram a mesma vaga | RPCs serializam por `for update` na atribuição/vaga; `unique` parcial evita duplicidade |

## Decisões pendentes do owner (propostas do planner)
1. **Proposta:** aceitar ADR-053 e ADR-057. Toda mudança de estado da atribuição é só online (RN-07), em vez de "confirmar offline" do rascunho do bloco.
2. **Proposta:** membros veem quem está escalado (RN-13).
3. **Proposta:** convite pode ser feito a qualquer membro ativo da equipe, com aviso se não tem a função ou está indisponível (não bloqueia).
4. **Proposta:** sem lembrete agendado no primeiro corte; reenvio manual pelo Líder (ADR-054).
5. **Proposta:** link de confirmação é um **link direto para o app** (exige login), sem token de uso único que confirme sem autenticar.
6. **Proposta:** disponibilidade por dia (não por serviço), com nota visível só a gestores.

## Issues
- [ ] Épico B4 / VS-03
- [ ] `feat/schedule-schema` — migration 0006, RLS, RPCs, Stage `musical_role`, testes `scripts/db` (backend-engineer)
- [ ] `feat/schedule-domain` — domínio + application + Dexie v14 + sync + testes (core-engineer)
- [ ] `feat/availability` — disponibilidade (domínio, application, UI do membro) (core-engineer + ui-engineer)
- [ ] `feat/schedule-leader-ui` — aba Escala, lacunas, sugestão, substituição; remove a escala provisória (ui-engineer)
- [ ] `feat/my-services` — "Meus próximos serviços" e lacunas no Início (ui-engineer)
- [ ] `feat/schedule-notifications` — outbox + gateway Brevo (backend-engineer)
