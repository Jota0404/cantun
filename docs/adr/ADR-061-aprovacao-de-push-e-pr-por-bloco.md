# ADR-061 — Revisão do ADR-058: aprovação de push e PR por bloco/fatia

- **Status:** Accepted — confirmado diretamente pelo Jota no chat do lead em 2026-10-11.
- **Data:** 2026-10-11
- **Decisor:** Jota (owner)
- **Escopo:** Governança da IA / Git
- **Relacionados:** ADR-009, ADR-050, ADR-058

## Contexto

O ADR-050 e o ADR-058 exigem aprovação explícita do owner **para cada ação** de push e abertura de PR. Com o trabalho dividido em blocos e fatias pequenas, a pergunta repetida a cada push atrasa a entrega sem acrescentar controle, já que o gate, o Revisor e o QA verificam a fatia.

## Decisão

Revisa o ADR-058 **só neste ponto**: a aprovação de **push** e de **PR** passa a ser **por bloco/fatia**.

1. O Jota aprova a fatia **no início** (escopo e arquivos, como o plano da seção Git do `CLAUDE.md`).
2. Depois disso, o lead faz **push da branch da fatia e abre o PR sem nova pergunta** quando todas as condições valerem:
   - gate local verde (`npm test && npm run lint && npm run build`, mais os testes de banco/servidor quando a fatia os tocar);
   - Revisor com parecer OK;
   - QA com parecer OK, quando o QA se aplica à fatia.
3. A aprovação vale **para aquela fatia**: não se estende a outras fatias, blocos nem sessões. Mudança de escopo durante a fatia volta ao owner.
4. **Continuam como hoje, com aprovação explícita para cada ação:** merge de PR, exclusão de branch, push forçado, rebase de branch compartilhada, mudança de settings/secrets/variables do GitHub e qualquer ação em banco ou ambiente de produção.
5. O resumo do PR traz o gate, o parecer do Revisor e o do QA, para o owner auditar depois.

## Alternativas consideradas

- **Manter a aprovação por ação:** máximo controle, mas atrasa fatias que já passaram por gate, Revisor e QA.
- **Autonomia total até o merge:** remove o controle humano sobre o que entra em `main`; rejeitada (o merge segue com o owner).

## Consequências

- `CLAUDE.md` (seção Git) e `AI_CONTEXT.md` §10 foram atualizados (aa6225a).
- Os princípios do ADR-009 e do ADR-050 continuam: controle humano sobre o que chega a `main`, rastreabilidade e nenhuma decisão `Accepted` alterada em silêncio.
