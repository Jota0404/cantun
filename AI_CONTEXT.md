# CANTUM — AI Context

> Contexto operacional para agentes de IA que trabalham no CANTUM. Curto de propósito: carregue sempre; consulte os documentos-fonte para detalhes.
> Última revisão: 2026-10-01 (alinhamento ao Blueprint v1.1).

## 1. Identidade

**CANTUM** — plataforma de operação de equipes de louvor: organizar pessoas e funções, montar serviços e escalas, preparar repertórios e ensaios e executar as músicas no culto. Futuro: Network para encontrar músicos externos para **necessidades pontuais de um serviço**.

Nasceu como MVP offline de cifras (nome provisório "Salmodia", concluído em ago/2026). O núcleo musical e o Modo Palco permanecem centrais.

## 2. Fontes de verdade (nesta ordem)

1. [`docs/CANTUM_PROJECT_BLUEPRINT.md`](docs/CANTUM_PROJECT_BLUEPRINT.md) — produto, escopo, comportamento, UX.
2. [`docs/CANTUM_ARCHITECTURE.md`](docs/CANTUM_ARCHITECTURE.md) + ADRs `Accepted` em [`docs/adr/`](docs/adr/) — arquitetura.
3. Feature Specs / GitHub Issues — escopo de implementação.
4. Código existente — evidência, **nunca** limite da visão aprovada.
5. Suposições da IA — sem autoridade.

`docs/SALMODIA_*.md` são **históricos** (MVP v0.1). Não usar como escopo atual.

## 3. Estado atual (atualizar ao fechar cada fase)

- **Concluído:** MVP v0.1; Supabase auth/sync (ADR-012); domínio canônico Organization → Team → Song/Repertoire → Service → ServiceItem → StageSession (ADR-014 em diante); Stage canônico autoritativo; presença/readiness efêmeras.
- **Em andamento:** Fase 0 — alinhamento de documentação, CI em `main`, higiene de segurança.
- **Próximo:** Fase 1 — papel Líder por equipe, status de membro, Service ↔ Team, estados de serviço, vagas de escala + confirmação, disponibilidade.
- **Legado em compatibilidade:** `Band*`, `Setlist*`, `SyncEngine`, `BandSyncEngine`, rotas `/bands*`, `/stage/setlist`, `/stage/session`. Só correção; nada de feature nova (ADR-038…045).

## 4. Stack

React 19 · React Router 7 · TypeScript · Vite + PWA · Dexie/IndexedDB · Supabase (Auth, Postgres + RLS, RPC, Realtime) · Vitest + Testing Library + fake-indexeddb · GitHub Actions/Pages.
Sem Redux (ADR-008). Nova dependência só com justificativa; nova lib de estado/UI só com ADR.

## 5. Arquitetura (resumo)

```text
pages/ components/  →  application/  →  domain/  ←  db/ (Dexie)  ·  sync/ + lib/supabase (remoto)
```

- UI nunca acessa Dexie/Supabase diretamente.
- `domain/` é TypeScript puro.
- Core **local-first**: escreve no Dexie, enfileira sync (`targetSyncQueue`/`TargetSyncEngine`, ADR-026).
- Network (futura) é cloud-backed e **não pode** degradar biblioteca, repertório ou Stage offline.
- Migrations Supabase: append-only, RLS em toda tabela, RPC `security definer` + `set search_path = ''`.
- Estado efêmero (presença, readiness, scroll) nunca é persistido como dado operacional.

## 6. Domínio — regras que não podem ser violadas

- **Access Role ≠ Musical Function.** Uma pessoa pode ter várias funções.
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
- O desenvolvedor mantém o controle (ADR-009): a IA não faz merge, push forçado, rebase de branch compartilhada nem apaga branches sem pedido explícito.

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
