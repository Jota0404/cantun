# B5 — Navegação & Design System

> Fase 1 · Esforço: ~2 semanas + contínuo · Depende de: B0 · Em paralelo com B2 · Blueprint §17, §32, §52, §61, §62, Apêndices A e B

## Objetivo
A navegação reflete o modelo mental da equipe (não o banco) e o visual segue a direção do Blueprint: escuro, alto contraste, verde como ação e tudo acessível ao toque.

## Estado atual
- Header "MUSIC WORKSPACE · CANTUM" + nav: Biblioteca · Nova música · Importar música · Repertórios · **Organizações**.
- Tema padrão **claro**; o escuro é opcional (`cantum-theme.css`, `localStorage 'cantum-theme'`).
- `HomePage`: hero "Tudo pronto para a próxima música" + atalhos de música. Não é contextual.
- Rotas legadas ativas: `/bands*`, `/stage/setlist/*`, `/stage/session/*`.
- Sem `eslint-plugin-jsx-a11y`.

## Decisões
**ADR-055 — Design system:**
- Tema escuro padrão; o claro continua disponível. Verde como cor de ação/identidade; tokens em CSS custom properties (`--color-*`, `--space-*`, `--radius-*`, `--font-*`).
- Componentes só com repetição comprovada (§61.1): botão, card, badge de estado, lista, campo de formulário, abas, bottom nav/sidebar.
- Alvos de toque ≥ 24 px (WCAG 2.2 AA) e **≥ 44 px no Stage**; foco visível; estado nunca comunicado só por cor.
- As referências visuais estão em `docs/assets/blueprint/`. Elas não são pixel-perfect e mostram a marca antiga.

## Escopo

**Entra:**
1. ADR-055 + `docs/DESIGN_TOKENS.md`.
2. Tokens e tema escuro padrão (respeitando a preferência salva).
3. Navegação: **Início · Serviços · Músicas · Equipe · Mais** (Repertórios, Ensaios, Histórico, Configurações). Sidebar no desktop, bottom nav no mobile. Remover "Nova música/Importar" do topo (viram ações em Músicas), "Organizações" no plural e "MUSIC WORKSPACE".
4. **Início contextual** (§52.1): próximo serviço relevante, pendências (confirmar escala, lacunas), situação da escala e atalhos. O bloco de atividade entra no B7.
5. Badges de estado (§53) para serviço, escala e membro.
6. `eslint-plugin-jsx-a11y` + `axe` nos testes de páginas principais.
7. Aposentar `/bands*` quando os gates do ADR-038/041 permitirem (verificar com `legacyDexieCompatibility`).
8. Apêndice B em toda tela nova: tarefa principal, informação prioritária, ação óbvia.

**Não entra:** redesign do Stage (D6) além de tokens compatíveis; identidade visual comercial (logo, marca).

## Entregáveis por PR
1. `docs/design-system-adr` · 2. `feat/design-tokens-dark-default` · 3. `feat/app-navigation` · 4. `feat/home-contextual` · 5. `chore/a11y-lint` · 6. `refactor/retire-band-routes` (quando os gates permitirem).

## Critérios de aceite
- No mobile, a bottom nav tem no máximo 5 destinos; no desktop, sidebar.
- Novo usuário cai no Início e vê o próximo serviço ou o onboarding.
- Contraste AA nos dois temas; navegação completa por teclado no desktop.
- Lint de acessibilidade sem erros.

## Testes
UI (navegação por papel/label, teclado), axe nas páginas principais, regressão visual manual em celular, tablet e desktop.

## Riscos
O redesign conflitar com telas em construção no B2–B4 → B5 entrega tokens e navegação primeiro; as telas de feature já nascem usando os tokens.
