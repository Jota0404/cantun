# B9 — Backend próprio (ADR-049, Fase B)

> Esforço: 6–10 semanas · Depende de: B1 completo + Fase 1 do produto concluída (B2–B4) · Referência: `docs/BACKEND_MIGRATION_PLAN.md` §4

## Objetivo
Substituir o Supabase por **PostgreSQL + backend próprio**, no padrão E.C.H.O, sem reescrever regras de negócio: a autorização continua no banco (RLS + funções), e o backend define papel e `app.user_id` a cada transação.

## Pré-condições
- Baseline reproduzível e CI de banco bloqueante (B1/A0).
- Zero `auth.uid()` (B1/A1) e zero imports do Supabase fora de `src/platform/supabase/` (B1/A2).
- `docs/REALTIME_CONTRACT.md` aprovado (B1/A3).
- Backup e restore testados (B8).

## Escopo
| Etapa | Conteúdo |
|---|---|
| B9.0 ADR de stack | linguagem/framework do backend, hospedagem do PostgreSQL (avaliar região Brasil, opção Aurora Serverless v2 do padrão E.C.H.O), deploy, ambientes |
| B9.1 Auth | cadastro, login, refresh, verificação e reset por e-mail, convites. Migrar os hashes bcrypt de `auth.users.encrypted_password` (validar no dump) para evitar reset geral |
| B9.2 API | endpoints 1:1 para as RPCs; cada request abre uma transação com `set local role` + `set_config('app.user_id', …)` e chama a mesma função SQL |
| B9.3 Realtime | WebSocket + `LISTEN/NOTIFY` (ou Redis) implementando o contrato; presença em memória, nunca persistida |
| B9.4 Adaptadores | `src/platform/http/` implementando os mesmos gateways; troca por variável de ambiente |
| B9.5 Operação | backups e restore, observabilidade (NFR-008), rate limit, logs sem conteúdo privado, alertas |
| B9.6 Cutover | ensaio de migração de dados, janela de corte, dupla validação, rollback documentado, desligamento do Supabase |

## Critérios de aceite
- Todos os testes de RLS do harness passam contra o backend novo.
- O Stage compartilhado funciona com o mesmo contrato (testes de reconexão e revision).
- Usuários entram com a senha antiga após o cutover.
- Restore testado no novo ambiente.

## Riscos
Realtime próprio menos robusto → testes de carga e reconexão antes do cutover; o Stage local-first continua funcionando offline.
