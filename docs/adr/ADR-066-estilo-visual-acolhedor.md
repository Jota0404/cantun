# ADR-066 — Estilo visual "Acolhedor" e componentes de interface (revisa o ADR-055)

- **Status:** Proposed
- **Data:** 2026-10-24
- **Decisor:** Jota (owner)
- **Escopo:** Interface / tema / componentes
- **Relacionados:** ADR-055 (revisado nos itens 2, 6 e 7), Blueprint §61, §62, D6 do plano (Palco) · Revisão de UX de 2026-10-24 (artifacts "Revisão de UX do CANTUM" e "Estilos visuais do CANTUM", direção C′)

## Contexto

A revisão de UX de 2026-10-24 percorreu o app no celular e no desktop e achou três causas de raiz: quase todo botão tem o mesmo peso visual (inclusive os destrutivos), telas longas de página única (Serviço, Ministério) e navegação que não segue o caminho serviço → ordem → palco. O owner aprovou a direção geral e escolheu, entre quatro estilos desenhados, a direção **C′ "Acolhedor verde"**: formas arredondadas, cartões com sombra leve e fonte Nunito Sans, mantendo o verde-água como cor de ação. No Modo Palco, o owner exige fundo preto.

O ADR-055 continua sendo a base (tokens em CSS, sem lib de UI, tema escuro padrão, verde como ação, contraste AA, alvos de 44/48 px). Três pontos dele precisam mudar: os componentes candidatos entram agora, o Palco ganha paleta própria preta e a tipografia deixa de ser só do sistema.

## Decisão

1. **Paleta.** O verde-água segue como cor de ação e identidade (ADR-055 item 3 e Blueprint §61 inalterados). Fundos e superfícies do tema escuro passam a um azul-petróleo:
   - escuro: `--color-bg #0d1620`, `--color-surface #142231`, `--color-surface-raised #1b2d3f`, `--color-border #27405a`, `--color-text #eef6f6`, `--color-text-muted #a3b8c4`, `--color-primary #2dd4bf`, `--color-primary-strong #5eead4`, `--color-on-primary #042420`;
   - claro: `--color-bg #f2f7f7`, `--color-surface #ffffff`, `--color-surface-raised #e3f0ef`, `--color-border #cfe2e0`, `--color-text #0f1f24`, `--color-text-muted #4f6670`, `--color-primary #0f766e`, `--color-primary-strong #115e59`, `--color-on-primary #ffffff`.
   Os demais tokens (estado, foco, overlay, borda de controle) são reajustados só se `tokens.test.ts` acusar contraste abaixo do mínimo. Os valores finais são os que passarem no teste.
2. **Formas.** Novo token `--radius-xl: 20px` para cartões e folhas. Botões, chips, abas e a barra de navegação usam `--radius-pill`. Campos de formulário usam `--radius-lg`. Cartões de conteúdo ficam sem borda, separados por `--shadow-soft`; campos e controles mantêm `--color-border-control` (3:1, ADR-055 item 4).
3. **Tipografia.** Nunito Sans (licença OFL) nos pesos 400, 600 e 800, em woff2 **servido pelo próprio app** (`public/fonts/`, pré-cache do PWA, `font-display: swap`), com a pilha do sistema como fallback. Nenhum CDN de fontes. Cifras usam a pilha monoespaçada do sistema (`ui-monospace`), para alinhar acordes e letra. Revisa o ADR-055 item 7.
4. **Hierarquia de ações.** Quatro estilos de botão: principal (verde cheio), secundário (superfície elevada), discreto (texto verde) e perigo (contorno vermelho). No máximo uma ação principal por tela, no topo ou numa barra fixa embaixo no celular. Excluir, cancelar e equivalentes ficam no menu "⋯" e pedem confirmação.
5. **Componentes.** Entram agora, com a repetição levantada na revisão (Blueprint §61.1): `Button`, `Card`, `Tabs` (pílula), `ActionMenu` ("⋯"), `Sheet` (folha de baixo no celular, diálogo no desktop, sobre `<dialog>` nativo) e `Icon`. Revisa o ADR-055 item 2 só na lista de componentes. Continua sem biblioteca de UI, de ícones ou CSS-in-JS.
6. **Ícones.** Conjunto pequeno de SVG inline próprio num único componente `Icon` (navegação e ações básicas), sempre ao lado de um rótulo de texto na navegação.
7. **Modo Palco.** Fundo preto puro (`--stage-bg: #000000`), superfícies `#0d0d0f` e `#17171b`, borda `#2a2a30`, mesmas formas e o verde do tema escuro. Escuro em qualquer tema. O indicador "AO VIVO" usa o vermelho padrão de transmissão ao vivo (novo token `--color-live: #e5251f`, texto branco, com ponto e rótulo, nunca só a cor), separado do verde de ação e do vermelho de erro. A cifra vem primeiro, o status vira chips curtos e os controles secundários vão para o "⋯". Só CSS e ordem dos blocos, sem função nova (ajuste visual liberado pelo owner dentro do D6). Revisa o ADR-055 item 6.
8. **Navegação.** Abas inferiores com ícone e rótulo: Início · Serviços · Músicas · Bandas · Perfil. No desktop, barra lateral com marca e ministério, conteúdo em até duas colunas.

## Alternativas consideradas

- **A · Sereno (evolução do visual atual):** menor risco, mas não resolve a percepção de app "estranho"; preterida pelo owner.
- **B · Palco (preto e âmbar, cantos retos, IBM Plex Sans):** identidade forte, mas fria para voluntários e troca a cor de ação; preterida.
- **C · Acolhedor azul:** escolhida no início, mas troca o verde do Blueprint §61; o owner preferiu manter o verde (C′).
- **Fonte só do sistema:** zero peso extra, mas perde parte do ar acolhedor da direção escolhida; rejeitada.
- **Fonte via Google Fonts:** quebra o uso offline e envia requisições a terceiros; rejeitada.

## Consequências

- Cerca de 100 a 150 KB a mais no pré-cache do PWA pela fonte (3 pesos, só latim).
- `tokens.css`, `tokens.test.ts` e `docs/DESIGN_TOKENS.md` mudam juntos na fatia 1.
- Migração em seis fatias só de interface: base visual; navegação e Início; Serviço; Músicas; Bandas e Perfil; Palco. Cada fatia com o QA de regressão musical.
- Os testes de UI seguem por papel e rótulo, então trocas de markup que mantêm nomes acessíveis não quebram testes.
- Nenhum impacto em domínio, Dexie, sync, servidor ou banco.
