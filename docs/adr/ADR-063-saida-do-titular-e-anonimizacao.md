# ADR-063 — Saída do titular: exclusão de conta, anonimização de autoria e exportação

- **Status:** Accepted (2026-10-17, decisões D1–D7 do Jota na spec VS-07)
- **Data:** 2026-10-17
- **Bloco / spec:** B8 · `docs/specs/VS-07-privacidade.md`
- **Relaciona-se a:** ADR-051, ADR-059, ADR-062, Blueprint §15, §30, NFR-008/009

## Contexto
`app.users` é referenciado por FKs com `on delete cascade` (`songs.user_id`, `assignments.user_id`, `*_memberships.user_id`, `organization_invites.invited_by_user_id`) e `restrict` (`services.created_by_user_id`). Apagar a conta hoje apagaria as cópias de música do Ministério (ADR-062) e quebraria por `restrict`. Não há `user_consents` nem log administrativo.

## Decisão (proposta)
1. **Exclusão é uma RPC única** `delete_my_account()` (`security definer`, `set search_path = ''`, `app.current_user_id()`), em uma transação: (a) bloqueia se o usuário é o **único Owner** de alguma organização (deve transferir ou excluir a organização antes); (b) **reatribui** o conteúdo da organização (`songs` com `organization_id` não nulo, `repertoires`, `services`) para um **usuário sentinela anônimo** `app.users` com e-mail reservado (`deleted@invalid`, sem login), preservando as cópias do Ministério; (c) apaga o conteúdo **pessoal** (`organization_id is null`), vínculos, atribuições, sessões, tokens e o próprio usuário.
2. **Anonimização, não cascata,** é a regra para autoria de conteúdo da organização (resolve o risco do ADR-062). A UI mostra "Ex-membro".
3. **Remover membro** (`team_member.remove`): apaga o vínculo de equipe e as atribuições futuras; autoria permanece (o membro continua titular de seu conteúdo pessoal). Não apaga a conta.
4. **Exportação:** RPC `export_my_data()` devolve JSON do titular (perfil, vínculos, músicas e repertórios próprios, atribuições, consentimentos). Nunca inclui dados de terceiros nem tokens.
5. **Log administrativo** `admin_events` (append-only): `actor_user_id`, `organization_id`, `action`, `target_user_id`, `created_at`. **Sem** conteúdo, e-mail ou letra. Na exclusão, `actor/target` do titular viram nulos.
6. **Consentimento:** `user_consents(user_id, document, version, accepted_at)`; versão vigente em constante do servidor; mudança de versão exige novo aceite.

## Alternativas
- Cascata (status quo): perde dados do Ministério. Rejeitada.
- Transferir ao Owner: exige escolha e notificação; vira fase 2 se pedido.
- Soft delete da conta com retenção: mantém dado pessoal; só com base legal definida pelo jurídico.

## Consequências
Migration aditiva em `db/migrations/`, RLS em tabelas novas, testes no job `db`. Sentinela precisa ficar fora de listas de membros e de `get_organization_member_profiles`. A decisão depende do jurídico (retenção, menores) e não decide o que é legal.
