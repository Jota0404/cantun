# CANTUM — AI Context

> Contexto operacional para agentes de IA que trabalham no CANTUM. Curto de propósito: carregue sempre; consulte os documentos-fonte para detalhes.
> Última revisão: 2026-10-09 (B1 concluído: Supabase removido, ADR-059).

## 1. Identidade

**CANTUM** — plataforma de operação de equipes de louvor: organizar pessoas e funções, montar serviços e escalas, preparar repertórios e ensaios e executar as músicas no culto. Futuro: Network para encontrar músicos externos para **necessidades pontuais de um serviço**.

Nasceu como MVP offline de cifras (nome provisório "Salmodia", concluído em ago/2026). O núcleo musical e o Modo Palco permanecem centrais.

## 2. Fontes de verdade (nesta ordem)

1. [`docs/CANTUM_PROJECT_BLUEPRINT.md`](docs/CANTUM_PROJECT_BLUEPRINT.md) — produto, escopo, comportamento, UX.
2. [`docs/CANTUM_ARCHITECTURE.md`](docs/CANTUM_ARCHITECTURE.md) + ADRs `Accepted` em [`docs/adr/`](docs/adr/) — arquitetura.
3. Feature Specs (`docs/specs/`), plano de blocos ([`docs/DELIVERY_PLAN.md`](docs/DELIVERY_PLAN.md) + `docs/blocks/`, um épico por bloco no GitHub) e Issues — escopo de implementação.
4. Código existente — evidência, **nunca** limite da visão aprovada.
5. Suposições da IA — sem autoridade.

`docs/SALMODIA_*.md` são **históricos** (MVP v0.1). Não usar como escopo atual.

## 3. Estado atual (atualizar ao fechar cada fase)

- **Concluído:** MVP v0.1; Supabase auth/sync (ADR-012); domínio canônico Organization → Team → Song/Repertoire → Service → ServiceItem → StageSession (ADR-014 em diante); Stage canônico autoritativo; presença/readiness efêmeras; **B0 Fundação** (CI em `main`, isolamento local ADR-048, portabilidade ADR-049, governança da IA ADR-050/058, templates, plano de blocos); spec do **B2 Equipe** (VS-01, ADR-051, `docs/PERMISSIONS.md`).
- **Concluído também:** **B1 Backend próprio** (ADR-059): PostgreSQL (`db/`) + servidor Node.js (`server/`), cliente em `src/platform`, legado removido, Supabase fora do projeto.
- **Em andamento:** **B2 Equipe** (spec VS-01; issues #57–#60). Hospedagem de produção ainda não definida (owner, antes do primeiro usuário real).
- **Próximo:** B3 Serviço (VS-02) → B4 Escala (VS-03); B5 Navegação/Design System em paralelo; B8 Privacidade antes de qualquer usuário real.
- **Legado:** `Band*`/`Setlist*`, `BandSyncEngine`, `bandStageRealtime` e as rotas `/bands*`, `/stage/setlist`, `/stage/session` foram **removidos** no B1 (ADR-059), não portados. Não recriar.

## 4. Stack

React 19 · React Router 7 · TypeScript · Vite + PWA · Dexie/IndexedDB · PostgreSQL 16 + servidor Node.js/TypeScript (Fastify, `pg`) com auth, RPC e WebSocket próprios · Vitest + Testing Library + fake-indexeddb · GitHub Actions/Pages.
Sem Redux (ADR-008). Nova dependência só com justificativa; nova lib de estado/UI só com ADR.

## 5. Arquitetura (resumo)

```text
pages/ components/  →  application/  →  domain/  ←  db/ (Dexie)  ·  sync/ + platform/ (remoto)  →  server/  →  PostgreSQL
```

- UI nunca acessa Dexie nem o remoto diretamente.
- `domain/` é TypeScript puro.
- Core **local-first**: escreve no Dexie, enfileira sync (`targetSyncQueue`/`TargetSyncEngine`, ADR-026).
- Network (futura) é cloud-backed e **não pode** degradar biblioteca, repertório ou Stage offline.
- SQL: append-only, RLS em toda tabela, função `security definer` + `set search_path = ''`, `app.current_user_id()`. Depois do baseline do B1, migrations novas só em `db/migrations/`. A autorização mora no banco; o servidor só define papel e usuário por transação.
- Estado efêmero (presença, readiness, scroll) nunca é persistido como dado operacional.

## 6. Domínio — regras que não podem ser violadas

- **Access Role ≠ Musical Function.** Uma pessoa pode ter várias funções.
- Papéis em dois níveis (D2): organização `owner`/`admin`/`member`; equipe `leader`/`member`.
- **Repertoire ≠ Service.** Repertório é reutilizável; Service é a ocasião real e o centro operacional.
- **Service ≠ StageSession.**
- Organization é dona de Team, Songs, Repertoires e Services; acesso por membership, nunca por "conhecer o id".
- Modelo não pode impedir Organization 1:N Team.
- Song preserva: title, artist, originalKey, currentKey, bpm (1–999), lyrics/chart, notes, favorite, timestamps.
- Transposição é domínio, derivada para exibição; a cifra base persistida não muda (ADR-007).
- **Arrangement** é conceito reservado: não criar tabela/CRUD/repository sem ADR.
- IDs `crypto.randomUUID()`; datas ISO 8601.

## 7. Modo Palco

Experiência crítica — "aplicação dentro da aplicação". Entrada: Service → Order → item musical → Stage.
Escuro, alto contraste, poucos controles, alvos de toque grandes, anterior/próxima na ordem do serviço, transposição rápida, fonte ajustável, auto-scroll, fullscreen/wake lock quando suportado, tolerante a rede instável. Ao trocar de música: topo + reinício do auto-scroll. Só o MD (operador) muta o estado compartilhado.
**Congelado para features novas até o fim da Fase 2 (D6):** só correções e o ajuste mínimo exigido pelo B3.

## 8. Fronteira do produto (Blueprint §3, §24, §37)

A IA **não deve** introduzir sem decisão explícita: chat/DM/feed, calendário como produto, onboarding de voluntários, devocionais, IA no produto, pagamentos/contratos/comissão, recrutamento permanente, gestão geral da igreja (CRM, financeiro, doações).
Atividade do sistema é log **somente leitura**. Network: uma solicitação contextual com no máximo uma mensagem; sem thread.

Teste de fronteira para qualquer ideia nova (§40): ajuda a organizar/planejar/preparar/executar um serviço? reduz trabalho ou confusão? é sobre música/equipe/serviço? não vira sistema de igreja? não vira marketplace/rede social?

## 9. Como trabalhar

1. Tarefa relevante parte de uma Feature Spec (Blueprint §34.1) com requisito rastreável (`RF-*`/`NFR-*`).
2. Mudança significativa: antes de codar, informar **arquivos afetados · ADRs envolvidos · riscos · plano**. Tarefa trivial: implementar direto.
3. Menor mudança que resolve. Não refatorar código não relacionado. Reutilizar soluções existentes antes de criar novas.
4. Comportamento novo em domain/application vem com teste.
5. Gate obrigatório: `npm test`, `npm run lint`, `npm run build` verdes.
6. Conflito com decisão `Accepted`: identificar → explicar impacto → propor alternativas → **aguardar decisão**.
7. Mudança de produto → atualizar o Blueprint; mudança arquitetural → novo ADR (próximo número livre em `docs/adr/README.md`).

Prioridade de implementação: correção → aderência ao produto → aderência à arquitetura → simplicidade → manutenção → desempenho → extensibilidade.

## 10. Git

- Branches `feature/*`, `fix/*`, `refactor/*`, `docs/*`, `test/*`, `chore/*` a partir de `main`; PR para `main`.
- Conventional Commits; um commit = uma unidade lógica.
- O desenvolvedor mantém o controle (ADR-009, ADR-050, ADR-058). Com aprovação explícita do owner para cada ação, a IA pode criar branch, commitar, rodar testes, fazer push, abrir PR, fazer merge (CI verde) e excluir branches já mescladas ou fechadas (registrando o SHA).
- Exclusivo do owner: push forçado em `main`, rebase de branch compartilhada, settings, secrets e variables do GitHub, e qualquer ação em banco ou ambiente de produção.

## 11. Como responder

```text
Resultado
Alterações (arquivos)
Gate (test / lint / build)
Riscos / pendências
Próximo passo
```

Direto e econômico em tokens: não repetir contexto, não explicar código trivial, mostrar só trechos alterados quando possível. Sugestões vão separadas da implementação (Sugestão · Motivo · Impacto · Recomendação) e não viram código sem aprovação.

## 12. Manutenção deste arquivo

Atualizar quando mudar fase, escopo, arquitetura, convenções ou workflow com IA. Não registrar detalhes temporários de tarefas. Manter curto.
