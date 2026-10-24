# ADR-055 — Design system: tokens em CSS custom properties

- **Status:** Accepted (2026-10-11, decisão do Jota repassada pelo lead, com as 8 decisões da spec VS-05) · itens 2, 6 e 7 revisados pelo [ADR-066](ADR-066-estilo-visual-acolhedor.md) (2026-10-24)
- **Data:** 2026-10-11
- **Decisor:** Jota (owner)
- **Escopo:** Interface / tema / acessibilidade
- **Bloco:** B5 (VS-05) · NFR-003, NFR-004 · Blueprint §61, §62
- **Relacionados:** ADR-008 (sem lib de estado), ADR-048, AI_CONTEXT.md §4 (nova lib de UI só com ADR) · Spec: [`docs/specs/VS-05-navegacao-design-system.md`](../specs/VS-05-navegacao-design-system.md)

## Contexto

O Blueprint §61 aponta a direção visual (escuro, alto contraste, verde como ação, navegação lateral no desktop e inferior no mobile) e condiciona tokens e componentes a uma **decisão de design system**. Hoje o CSS mistura variáveis (`--color-*` em `cantum-theme.css`) com cores literais por tela; o Modo Palco tem paleta própria em hexadecimal. O tema padrão é claro. Há botões do Palco abaixo de 44 px (`ServiceStagePage.css`, `ServiceStageMusicianPage.css`; o auto-scroll tem 40 px). O app é uma PWA offline-first, então peso e dependências importam.

## Decisão

1. **Tokens em CSS custom properties**, um arquivo (`src/styles/tokens.css`), por tema (`:root[data-theme='dark']` padrão e `[data-theme='light']`). Famílias: `--color-*`, `--space-*`, `--radius-*`, `--font-*`, `--shadow-*`, `--size-touch-*`, `--color-focus`. Telas e componentes novos não usam cor, espaçamento ou tamanho literais.
2. **Sem biblioteca de UI** (Material, Chakra, Radix, Tailwind, shadcn etc.), nem de ícones, nem de CSS-in-JS. Componentes são React + CSS próprios, criados só com **repetição comprovada** (Blueprint §61.1). Certos no primeiro corte: `AppNav` e `Badge`. Candidatos, entram no 3º uso real: `Button`, `Card`, `Field`, `Tabs`.
3. **Tema escuro padrão**; claro disponível; a escolha salva (`cantum-theme`) é respeitada. Verde como cor de ação e identidade.
4. **Acessibilidade como requisito de token:** contraste AA (4,5:1 texto; 3:1 texto grande, ícones e bordas de controle) nos dois temas; foco visível por `:focus-visible`; suporte a `prefers-contrast: more`, `forced-colors` e `prefers-reduced-motion`; estado nunca só por cor (§53).
5. **Alvos de toque:** `--size-touch-min: 44px` em todo controle; no Modo Palco o piso é 44 px e os primários usam `--size-touch-stage: 48px`. O mínimo do WCAG 2.2 AA (2.5.8) é 24 px; 44 px é decisão de produto para uso em celular. Ajustar o Palco é correção de CSS, não feature (D6).
6. **Modo Palco** consome um subconjunto `--stage-*` derivado dos tokens, sem redesenho.
7. **Tipografia:** pilha de fontes do sistema, sem webfont; ícones como SVG inline pontuais; rótulos de navegação sempre com texto.
8. **Verificação:** `eslint-plugin-jsx-a11y` e uma biblioteca de `axe` (testes) como dependências **de desenvolvimento**, adicionadas pelo lead com justificativa no PR.
9. **Documentação viva:** `docs/DESIGN_TOKENS.md` lista os tokens e o uso; muda junto com `tokens.css`.

## Alternativas consideradas

- **Tailwind ou biblioteca de componentes:** acelera telas, mas adiciona dependência, peso e um segundo vocabulário de estilo, contra a regra de "nova lib de UI só com ADR" e o princípio de repetição comprovada; rejeitada.
- **CSS-in-JS ou CSS Modules:** exige mudança de toolchain e reescrita de todos os `Foo.css` ao lado dos componentes (convenção do projeto); rejeitada.
- **Manter cores literais por tela:** impede tema consistente e verificação de contraste; rejeitada.
- **Seguir o tema do sistema por padrão:** boa prática geral, mas o Blueprint pede identidade escura e o uso é em ambientes de pouca luz; adiado como opção "Sistema" se o público pedir.
- **Toggle próprio de alto contraste:** aumenta superfície; `prefers-contrast` e `forced-colors` já atendem; adiado.
- **Alvos de 24 px (mínimo AA):** atende ao critério mínimo, mas é pequeno para o polegar e para o palco; rejeitado.

## Consequências

- Uma migração gradual do CSS existente para tokens; telas novas (B2–B4) já nascem com eles.
- O tema padrão muda de claro para escuro para quem não tem escolha salva.
- Testes passam a incluir `axe` e checagem de alvos de toque; novas dependências de desenvolvimento (`jsx-a11y`, `axe`) entram em PR do lead.
- Ajuste de CSS no Modo Palco (tamanho dos alvos), sem mudar o comportamento.
- Nenhum impacto em SQL, Dexie, sync ou servidor.
