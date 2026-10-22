# B7 — Execução & Histórico (VS-06)

> Fase 2/3 · Esforço: 2–3 semanas · Depende de: B6 · Blueprint §8.9, §9, §52.1, §57, NFR-007

> **Status:** implementado (fatias 1–7; 0023 e 0024). QA do bloco feito. D1–D6 decididas pelo Jota (2026-10-22). Pendente do Jota: aplicação das migrations 0007–0024 em produção.

## Objetivo
Fechar o ciclo **Executar → Registrar**: o serviço executado vira histórico útil para a liderança, e o Stage, descongelado, é refinado e simplificado.

## Estado atual
- O Stage canônico é autoritativo (ADR-044/047), com sessão compartilhada, presença, readiness, transições e anotações do MD.
- `ServiceStagePage.tsx` (220 linhas, ~17 KB, JSX em linhas longas, exceção de lint #42) e `StagePage.tsx` (581 linhas, Palco solo) concentram lógica demais. `bandStageRealtime.ts` e os adaptadores legados já saíram no B1 (ADR-059).
- O Stage canônico ainda usa nomes do legado: `BandStagePresencePanel`, classes `band-stage-*`, textos "MODO BANDA" e "Setlist".
- Não existem histórico nem log de atividade.
- Spec: [`VS-06-execucao-historico.md`](../specs/VS-06-execucao-historico.md) (decisões D1–D6 decididas em 2026-10-22).

## Escopo

**Entra:**
1. Spec `docs/specs/VS-06-execucao-historico.md`.
2. **Registro do serviço** ao encerrar: transição `in_progress → completed` grava músicas executadas, tons, equipe confirmada e duração.
3. **Histórico por música**: última vez tocada, frequência, tons usados e repertórios relacionados (consultas/views, sem analytics sofisticado, §9).
4. **ActivityLog** somente leitura (§52.1): repertório atualizado, escala publicada, confirmação, ensaio criado, material adicionado. Sem comentários, curtidas ou respostas. Gerado por triggers/RPC, nunca pelo cliente.
5. Bloco "Atividade" no Início (B5).
6. **Fim do freeze do Stage (D6), sem feature nova:** renomear o legado "Band" do Stage canônico; refatorar `ServiceStagePage.tsx` (e, opcional, `StagePage.tsx`) em hooks/componentes; testar que a saída da sessão descarta o estado temporário (§57).
7. Teste manual do Stage (§58.4): celular, tablet, rotação, offline, rede instável, toques rápidos, reconnect.

**Não entra:** relatórios avançados, exportação, CCLI.

## Critérios de aceite
- Ao concluir o serviço, o histórico mostra data, repertório, equipe e tons.
- A música mostra "última vez tocada" e os tons usados.
- O ActivityLog não tem nenhum controle de interação social.
- Nenhum arquivo do Stage passa de ~300 linhas sem justificativa; os testes de regressão do Stage passam.

## Riscos
Refatoração do Stage quebrar a execução ao vivo → testes de contrato do Realtime (B1/A3) antes de refatorar.
