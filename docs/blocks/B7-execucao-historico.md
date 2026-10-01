# B7 — Execução & Histórico (VS-06)

> Fase 2/3 · Esforço: 2–3 semanas · Depende de: B6 · Blueprint §8.9, §9, §52.1, §57, NFR-007

## Objetivo
Fechar o ciclo **Executar → Registrar**: o serviço executado vira histórico útil para a liderança, e o Stage, descongelado, é refinado e simplificado.

## Estado atual
- O Stage canônico é autoritativo (ADR-044/047), com sessão compartilhada, presença, readiness, transições e anotações do MD.
- `StagePage.tsx` (675 linhas) e `bandStageRealtime.ts` (518 linhas) concentram lógica demais.
- Não existem histórico nem log de atividade.

## Escopo

**Entra:**
1. Spec `docs/specs/VS-06-execucao-historico.md`.
2. **Registro do serviço** ao encerrar: transição `in_progress → completed` grava músicas executadas, tons, equipe confirmada e duração.
3. **Histórico por música**: última vez tocada, frequência, tons usados e repertórios relacionados (consultas/views, sem analytics sofisticado, §9).
4. **ActivityLog** somente leitura (§52.1): repertório atualizado, escala publicada, confirmação, ensaio criado, material adicionado. Sem comentários, curtidas ou respostas. Gerado por triggers/RPC, nunca pelo cliente.
5. Bloco "Atividade" no Início (B5).
6. **Fim do freeze do Stage (D6):** refatorar `StagePage.tsx` e `bandStageRealtime.ts` em hooks/serviços; remover adaptadores legados quando os gates do ADR-045 permitirem; garantir a saída da sessão descartando o estado temporário (§57).
7. Teste manual do Stage (§58.4): celular, tablet, rotação, offline, rede instável, toques rápidos, reconnect.

**Não entra:** relatórios avançados, exportação, CCLI.

## Critérios de aceite
- Ao concluir o serviço, o histórico mostra data, repertório, equipe e tons.
- A música mostra "última vez tocada" e os tons usados.
- O ActivityLog não tem nenhum controle de interação social.
- Nenhum arquivo do Stage passa de ~300 linhas sem justificativa; os testes de regressão do Stage passam.

## Riscos
Refatoração do Stage quebrar a execução ao vivo → testes de contrato do Realtime (B1/A3) antes de refatorar.
