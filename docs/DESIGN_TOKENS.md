# Tokens de design

> Fonte: `src/styles/tokens.css` (ADR-055, VS-05 RN-07 a RN-11). Este documento descreve o uso; o valor vale o do arquivo.
> Importado em `src/main.tsx` antes de `index.css`. Contraste conferido em `src/styles/tokens.test.ts` (rode `npx vitest run src/styles`).

## Tema

- **Escuro é o padrão** (`:root`). `:root[data-theme='light']` troca só as cores.
- `src/theme.ts` lê `localStorage['cantum-theme']`: só `light` salvo abre claro; sem escolha ou com valor desconhecido, abre escuro. `main.tsx` aplica o tema antes do primeiro render.
- Sem opção "Sistema" (decisão do owner, 2026-10-11).

## Cores (por tema)

| Token | Uso |
|---|---|
| `--color-bg` | fundo da página |
| `--color-surface`, `--color-surface-raised` | cartões, campos; superfícies elevadas |
| `--color-border` | divisórias e bordas decorativas |
| `--color-border-control` | borda de campos e controles (≥ 3:1 sobre o fundo) |
| `--color-text`, `--color-text-muted` | texto principal e secundário (≥ 4,5:1) |
| `--color-primary`, `--color-primary-strong` | ação (verde); hover/links |
| `--color-on-primary` | texto sobre `--color-primary` e `--color-primary-strong` |
| `--color-danger`, `--color-warning`, `--color-success`, `--color-info` | estados; sempre com texto, os de atenção também com ícone ou forma (RN-12) |
| `--color-danger-surface`, `--color-success-surface` | fundo de mensagens de erro e sucesso |
| `--color-focus` | anel de foco (≥ 3:1 sobre o fundo e as superfícies) |
| `--color-overlay` | fundo escurecido atrás de diálogos |
| `--color-live`, `--color-on-live` | indicador "AO VIVO" do Palco (iguais nos dois temas; sempre com ponto e rótulo) |
| `--shadow-soft` | sombra de cartões (ADR-066: cartões sem borda) |

## Escalas (iguais nos dois temas)

- Espaçamento: `--space-1…8` = 4, 8, 12, 16, 24, 32, 48, 64 px.
- Raio: `--radius-sm/md/lg/xl/pill` = 6, 8, 12, 20 px, 999 px (`xl` para cartões e folhas; botões, abas e navegação em pílula).
- Tipografia: `--font-sans`, `--font-mono`, `--font-size-sm/md/lg/xl`, `--line-height-tight/base`. Fonte Nunito Sans (400, 600, 800) via `@fontsource/nunito-sans`, só latim, importada em `main.tsx` e pré-cacheada pelo PWA (offline, sem CDN); fallback na pilha do sistema.
- Foco: `--focus-ring-width` = 2 px.
- Alvo de toque: `--size-touch-min` = 44 px; `--size-touch-stage` = 48 px (navegação entre músicas e auto-scroll no Palco).

## Aliases

Nomes anteriores aos tokens continuam funcionando até as telas migrarem: `--color-background` → `--color-bg`, `--color-surface-elevated` → `--color-surface-raised`, `--color-accent` → `--color-primary`.

## Regras de uso

- Telas e componentes novos não usam cor nem tamanho literal: só tokens.
- Telas antigas migram por demanda, sem redesenho em massa.
- Todo controle interativo tem ≥ 44 px (regra global em `index.css`; links dentro de texto são exceção). No Palco, o piso é 44 px e os primários 48 px (D6: só CSS).
- Foco visível: `:focus-visible` com anel de 2 px em `--color-focus`; em `forced-colors: active` o sistema escolhe a cor (`Highlight`).
- `prefers-contrast: more` reforça `--color-border` e `--color-text-muted`. `prefers-reduced-motion: reduce` zera animações e transições.
- Link "Pular para o conteúdo" (`SkipLink`) é o primeiro item da tabulação e leva o foco ao `<main>`.

## Como mudar um valor

1. Edite `tokens.css` nos dois temas, se for cor.
2. Rode `npx vitest run src/styles`: o teste falha se algum par de cores cair abaixo do mínimo.
3. Atualize esta tabela se o uso mudar.

## Componentes (`src/components/ui/`, ADR-066)

- `Button`: `variant` primary (uma por tela), secondary (padrão), ghost (ação discreta), danger (contorno vermelho; prefira o `ActionMenu` + confirmação).
- `Card`: agrupa conteúdo sem borda, com `--radius-xl` e `--shadow-soft`.
- `Tabs`: seções da mesma tela (tablist ARIA, setas/Home/End); aba ativa controlada por `value`/`onChange`.
- `ActionMenu`: "⋯" para ações secundárias e destrutivas; `label` obrigatório; itens `danger` vão ao fim.
- `Sheet`: formulário ou escolha curta sobre a tela; folha de baixo no celular, diálogo no desktop; `ConfirmModal` segue para confirmações.
- `Icon`: SVG próprio (home, services, music, bands, profile, more, back, add, play); decorativo, sempre ao lado de texto.
