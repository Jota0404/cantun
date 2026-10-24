# CANTUM — AI Context

> Contexto operacional para agentes de IA que trabalham no CANTUM. Curto de propósito: carregue sempre; consulte os documentos-fonte para detalhes.
> Última revisão: 2026-10-23 (`main` @ `826eafa`: B0–B8 concluídos em código; falta o lançamento, que é do owner).

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

Resumo para o owner: [`docs/STATUS_DO_PROJETO.md`](docs/STATUS_DO_PROJETO.md). Passagem entre sessões: `.claude/handoffs/00-LEIA-ME-PRIMEIRO.md`.

- **Concluído (código em `main`, migrations 0001–0027, Dexie v21):** MVP v0.1; domínio canônico (ADR-014 em diante); **B0** Fundação; **B1** Backend próprio (ADR-059: PostgreSQL em `db/`, servidor Node.js em `server/`, cliente em `src/platform`; Supabase e legado removidos); **B2** Equipe (0004); **B3** Serviço (0005); **B4** Escala (0006); **FIX-01** jornada musical (0007–0010, ADR-062); **B5** Navegação/Design System; **B8** Privacidade (0011–0016 e 0019: consentimento, exportação, exclusão de conta com reautenticação, remoção de membro, idade mínima 16, backup/restore); **B6** fatias 1–7 (0017 tom por serviço, 0018 reprise/medley, 0020 "preparado", 0021 ensaio, 0022 materiais por link); **B7** fatias 1–7 + QA (0023 registro da execução, 0024 log de atividade, "Realizados", histórico na música, Palco renomeado e refatorado). D1–D6 do VS-06 decididas pelo owner (2026-10-22).
- **Depois do QA do B7:** 0025 (uma sessão de Palco aberta por serviço), 0026 (trocar de item zera o tom ao vivo), 0027 (serviço concluído não se exclui), "Realizados" em Meus serviços, tela cheia/wake lock nos Palcos do serviço; follow-ups #87, #117, #127 itens 1/3/4/5, #132 itens 1–5 e sync (ordem pai→filho na fila, timeouts e `epoch`, acesso perdido, `signOut` limpo).
- **Fora do MVP por decisão do owner:** B6 fatia 8 (upload de arquivos; D10, ADR-064 segue `Proposed`; materiais só como link `https`); ideias em `docs/FUTURE_IDEAS_IMPORT_AND_AUDIO.md` (não propor).
- **Aberto (código):** #127 itens 2 e 6, #132 item 6, #42 (6 exceções de lint), #22 (Modo Passagem; Palco congelado). Épicos #50 (B6) e #51 (B7) ainda abertos no GitHub.
- **Próximo (owner, não é tarefa da IA):** lançamento — hospedagem (preferência AWS, decidir perto do lançamento), migrations 0007–0027 em produção (0019 antes do servidor novo), restore real testado, texto jurídico. Ver `docs/GO_LIVE_CHECKLIST.md`.
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
Hoje o Palco do serviço (`/stage/service-session/*`) tem topo ao trocar de música, wake lock e tela cheia, mas **não** tem auto-scroll nem transposição rápida (só o Palco avulso `/stage/song/*`); acrescentar é feature, decisão do owner.

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
- O desenvolvedor mantém o controle (ADR-009, ADR-050, ADR-058, ADR-061). Push e PR são aprovados por fatia: com gate verde + Revisor OK + QA OK (quando se aplica), a IA faz push e abre o PR sem nova pergunta (ADR-061). Para as demais ações, com aprovação explícita do owner para cada ação, a IA pode criar branch, commitar, rodar testes, fazer merge (CI verde) e excluir branches já mescladas ou fechadas (registrando o SHA).
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
