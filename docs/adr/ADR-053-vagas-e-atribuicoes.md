# ADR-053 — Vagas e atribuições da escala

- **Status:** Accepted (owner, 2026-10-11)
- **Data:** 2026-10-11
- **Decisor:** Jota (owner)
- **Escopo:** Escala / ServicePosition / Assignment
- **Bloco:** B4 (VS-03) · Decisão D3 · Requisitos RF-SCH-001…005, RF-TEAM-005
- **Relacionados:** ADR-051, ADR-052, ADR-057, ADR-059 · Spec: [`docs/specs/VS-03-escala.md`](../specs/VS-03-escala.md)

## Contexto

Hoje `assignments (service_id, user_id, musical_function texto livre, status pending|accepted|declined)` liga uma pessoa ao serviço sem noção de quantas pessoas cada função exige. Só Owner e Admin escrevem, e o membro não consegue responder à própria escala. O Blueprint §8.3 (v1.2) separa a **vaga** (função + quantidade) da **atribuição** (pessoa na vaga) e lista os estados `invited`, `confirmed`, `declined`, `replacement_needed` e `cancelled`.

## Decisão

1. **Vaga:** tabela `service_positions (service_id, musical_function, quantity 1..20, notes)`, uma por função e serviço. Função é uma das 11 de `team_musical_functions`.
2. **Atribuição:** `assignments.position_id not null`; `status` ∈ `invited | confirmed | declined | replacement_needed | cancelled`; `responded_at`; `replaced_assignment_id`. `unique (position_id, user_id)` parcial sobre os estados ativos (`invited`, `confirmed`, `replacement_needed`).
3. **Estados e transições:**
   - `invited → confirmed | declined` (só o titular);
   - `confirmed → replacement_needed` (titular ou gestor);
   - `invited | confirmed | replacement_needed → cancelled` (gestor);
   - `declined` e `cancelled` são finais; reconvidar cria **outra** atribuição.
4. **Vaga aberta ou preenchida é derivada**, nunca gravada: `filled` se `confirmed ≥ quantity`, senão `open`; lacuna = `quantity − confirmed`.
5. **Mudança de estado só por RPC** `security definer` (`assign_member`, `respond_to_assignment`, `request_replacement`, `replace_assignment`, `cancel_assignment`). `cantum_user` perde `insert/update/delete` em `assignments`.
6. **Quem faz o quê:** `schedule.manage` (Owner, Admin, Líder ativo da equipe do serviço) para vagas, atribuir, substituir e cancelar; **só o titular** responde. A pessoa atribuída é membro ativo da equipe do serviço.
7. **Serviço final** (`completed`/`cancelled`) congela vagas, atribuições e respostas.
8. **Disponibilidade** (`member_availability`: membro × data → `available | unavailable | tentative`) apoia a sugestão; nunca bloqueia nem vira calendário (§8.4). Visível só ao próprio e aos gestores da equipe do membro.
9. **Stage (D6):** `get_service_stage_songs` passa a ler status `invited`/`confirmed` e a função da vaga; nenhuma feature nova.

## Alternativas consideradas

- **Vaga implícita (agrupar atribuições por função):** não permite vaga sem ninguém, que é a lacuna que o Líder precisa ver; rejeitada.
- **Gravar `open/filled` na vaga:** duplica estado e diverge ao cancelar ou recusar; rejeitada (derivado).
- **Líder/Admin responde por outra pessoa:** quebra a responsabilidade pessoal da confirmação; rejeitada.
- **Reaproveitar a atribuição recusada (voltar a `invited`):** perde o histórico; rejeitada.
- **Disponibilidade por serviço em vez de por dia:** mais precisa, mais trabalho para o membro; adiada.

## Consequências

- Uma migration (`0006_schedule.sql`) e uma `version()` do Dexie (14); `assignments` vira somente leitura no cliente.
- A escala provisória do B3 é substituída; o Stage tem um ajuste mínimo.
- `PERMISSIONS.md` ganha `schedule.manage`, `availability.set_own` e os casos E1–E12.
