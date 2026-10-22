# Feature Spec — VS-05 Navegação e Design System

- **Status:** Aprovada (decisões fechadas em 2026-10-11)
- **Bloco:** B5 (`docs/blocks/B5-navegacao-design-system.md`)
- **Fatia vertical:** VS-05
- **Autor / data:** Claude Code (planner), para revisão do Jota · 2026-10-11
- **Decisão associada:** [ADR-055](../adr/ADR-055-design-system-tokens.md) (Accepted) · Base: Blueprint §17, §32, §52, §53, §61, §62, Apêndice B; NFR-001/003/004

## Feature
Navegação principal que reflete o modelo mental da equipe (**Início · Serviços · Músicas · Bandas · Mais**), tokens de design em CSS custom properties com tema escuro por padrão, Início contextual, badges de estado e acessibilidade verificável (WCAG 2.2 AA, alvos de toque ≥ 44 px, inclusive no Modo Palco).

## Objetivo
O próximo trabalho do usuário fica fácil de achar (§62.1), a função e as lacunas aparecem sem procurar (§62.2–3) e a interface é legível e tocável no celular, no tablet e no desktop. Sustenta o Blueprint §26 (itens 3 e 4) e os NFR-003 e NFR-004. Telas novas dos blocos B2–B4 passam a nascer com os tokens.

## User Stories
- Como **usuário**, quero uma navegação com poucos destinos claros, para chegar a serviços, músicas e equipe sem procurar.
- Como **Membro**, quero abrir "Meus serviços" direto, para ver onde estou escalado e confirmar.
- Como **Líder**, quero ver no Início o próximo serviço e as lacunas da escala, para agir sem abrir várias telas.
- Como **usuário novo**, quero cair no Início e ver o onboarding ou o próximo serviço.
- Como **músico no palco**, quero botões grandes e fáceis de acertar, para operar com a mão ocupada e pouca luz.
- Como **pessoa que usa teclado ou leitor de tela**, quero foco visível, ordem lógica e estados anunciados em texto.
- Como **pessoa que prefere tema claro**, quero trocar de tema e ter a escolha lembrada.

## Regras de negócio
- **RN-01** Destinos principais, nesta ordem: **Início, Serviços, Músicas, Bandas, Mais** ("Bandas" é o rótulo de interface de *Team*; ver RN-17). "Mais" agrupa Repertórios, Configurações e Sair. Ensaios (B6) e Histórico (B7) ficam escondidos até existirem, sem placeholder vazio. Network é futuro (B10) e não aparece.
- **RN-02** **Serviços** abre `/servicos` com duas abas: **Meus serviços** (`/meus-servicos`, criada no B4) e **Todos os serviços** (lista por equipe, próximos / em planejamento / realizados, ADR-052). Quem não tem permissão de gestão (`service.create`) vê só "Meus serviços". "Meus serviços" também é atalho no Início. *Emenda (owner, 2026-10-22, B7):* "Meus serviços" ganha a seção **Realizados** com os serviços concluídos em que o próprio membro participou (abrem o Registro da execução, VS-06); a aba "Todos os serviços" e o "Realizados" de gestão continuam só para `service.create`.
- **RN-03** Mobile (< 900 px): barra inferior fixa com os 5 destinos. Desktop e tablet largo (≥ 900 px): barra lateral com os mesmos destinos e rótulos de texto. Nunca só ícone.
- **RN-04** O destino ativo usa `aria-current="page"` e indicação visual além de cor.
- **RN-05** Saem do cabeçalho: "Nova música" e "Importar música" (viram ações da tela Músicas), "Organizações" no plural e "MUSIC WORKSPACE". O nome do produto é "CANTUM". As rotas existentes (`/organizations*`, `/songs*`, `/repertoires*`, `/services/:id`) **continuam válidas**; "Bandas" (`/bandas`, antes `/equipe`) resolve o Ministério principal da conta (B2 RN-11) e leva à lista de bandas dele.
- **RN-06** Modo Palco (`/stage/*`) continua sem navegação do app (já é assim): tela cheia, escuro, poucos controles (D6).
- **RN-07** **Tema:** escuro por padrão; claro continua disponível; a escolha salva (`cantum-theme`) é respeitada. Sem escolha salva, usa escuro. (Alternativa descartada: seguir o sistema.)
- **RN-08** **Tokens** (ADR-055): cores, espaçamento, raio, tipografia, sombras, foco e tamanho mínimo de toque são custom properties em um único arquivo; componentes e telas novas não usam cores nem tamanhos literais. As telas existentes migram aos poucos, sem redesenho em massa.
- **RN-09** **Contraste:** texto normal ≥ 4,5:1 e texto grande e ícones/bordas de controle ≥ 3:1, nos dois temas e em todos os estados (padrão, hover, desabilitado, foco). O tema escuro segue a direção do Blueprint §61: escuro, alto contraste, verde como ação. Respeita `prefers-contrast: more` (aumenta bordas e contraste de texto) e `forced-colors: active` (não depender de cor de fundo para o foco). Sem modo de "alto contraste" próprio além disso.
- **RN-10** **Alvos de toque:** todo controle interativo tem área de pelo menos **44 × 44 px** (`--size-touch-min`), com espaçamento mínimo de 8 px entre vizinhos. O piso do WCAG 2.2 AA (2.5.8) é 24 px; o produto adota 44 px por uso em celular. No **Modo Palco**, vale 44 px como piso, e os controles primários de navegação entre músicas e de auto-scroll têm 48 px ou mais. Hoje há botões do Palco abaixo disso (`ServiceStagePage.css`, `ServiceStageMusicianPage.css` sem `min-height`; `.stage-controls__auto-scroll-row button` com 40 px); a correção é de CSS e entra como correção, não como feature (D6).
- **RN-11** **Foco visível** (`:focus-visible`) com anel de 2 px e contraste ≥ 3:1 sobre qualquer fundo; ordem de tabulação segue a ordem visual; nada fica preso (sem armadilha de teclado). Link "Pular para o conteúdo" no início da página.
- **RN-12** **Estado nunca só por cor** (§53): todo badge tem texto, e os de atenção têm também ícone ou forma. Estados cobertos: serviço (`draft`, `ready`, `in_progress`, `completed`, `cancelled`), atribuição (`invited`, `confirmed`, `declined`, `replacement_needed`, `cancelled`), vaga (`open`, `filled`) e membro (`active`, `inactive`, `pending_invite`).
- **RN-13** **Início contextual** (§52.1), para cada papel: (a) próximo serviço relevante do usuário (data, local, função, estado); (b) pendências: confirmar escala (B4), serviços com vagas abertas (Líder/Admin/Owner); (c) atalhos: Meus serviços, abrir Músicas, abrir Modo Palco quando houver sessão `live`. Usuário novo sem organização vê o onboarding (B2). O bloco de atividade é do B7 e não entra.
- **RN-14** **Apêndice B** em toda tela nova: a spec ou a PR descreve tarefa principal, informação prioritária e ação óbvia.
- **RN-15** **Componentes só com repetição comprovada** (§61.1): certos no primeiro corte = `AppNav` (barra inferior e lateral) e `Badge`. Candidatos, entram no 3º uso real: `Button`, `Card`, `Field`, `Tabs`. Sem biblioteca de UI.
- **RN-17** (P4, Jota 2026-10-15) **Nomenclatura da interface:** Organização aparece como **"Ministério"** e Equipe como **"Banda"** (plural "Ministérios" e "Bandas"), vindos de um único módulo de textos (FIX-01 RN-A11). O código e o banco seguem `Organization` e `Team` (ADR-011). Os rótulos da navegação usam esse módulo.
- **RN-16** Movimento: respeita `prefers-reduced-motion`. A navegação funciona sem JavaScript de animação.

## Acceptance Criteria
- [ ] No mobile há barra inferior com no máximo 5 destinos; no desktop, barra lateral; ambos com texto.
- [ ] "Meus serviços" é alcançável em um toque a partir de Serviços e do Início; `/meus-servicos` abre direto.
- [ ] O usuário novo cai no Início e vê o onboarding ou o próximo serviço.
- [ ] O cabeçalho não mostra "Nova música", "Importar música", "Organizações" nem "MUSIC WORKSPACE"; as ações de música estão na tela Músicas.
- [ ] Tema escuro por padrão; claro disponível; a escolha persiste; sem a escolha, abre escuro.
- [ ] Contraste AA nos dois temas (verificado por teste automatizado e inspeção manual dos estados de foco e desabilitado).
- [ ] Navegação completa por teclado no desktop, com foco visível e "Pular para o conteúdo".
- [ ] Todo controle interativo mede ≥ 44 × 44 px no celular; no Modo Palco o menor controle mede ≥ 44 px e os primários ≥ 48 px.
- [ ] Os badges de estado têm texto (e ícone nos de atenção); nenhum estado é só cor.
- [ ] O Início mostra o próximo serviço, as confirmações pendentes e as vagas abertas conforme o papel.
- [ ] `eslint-plugin-jsx-a11y` sem erros e `axe` sem violações nas páginas principais.
- [ ] `prefers-reduced-motion`, `prefers-contrast: more` e `forced-colors` não quebram o layout.
- [ ] As rotas existentes continuam funcionando.

## Requisitos
| ID | Descrição | Origem |
|---|---|---|
| NFR-003 | Experiências principais em celular, tablet e desktop. | Blueprint §29 |
| NFR-004 | Acessibilidade, no mínimo WCAG 2.2 AA aplicável. | Blueprint §29 |
| NFR-001 | Navegação e Início funcionam offline (dados locais). | Blueprint §29 |
| UX-NAV | Navegação reflete o modelo mental da equipe. | Blueprint §52 |
| UX-HOME | Início contextual: próximo serviço, pendências, escala. | Blueprint §52.1 |
| UX-STATE | Estados visíveis e consistentes. | Blueprint §53 |
| UX-DS | Tokens e componentes por repetição comprovada. | Blueprint §61 |
| UX-RULES | Decisões de UX §62 e Apêndice B. | Blueprint §62, §43 |

Não há RF-* numerado para navegação no Blueprint: `UX-*` são rótulos locais de rastreio para as seções citadas, não IDs do Blueprint.
Rastreio: NFR-003 → RN-03, RN-10; NFR-004 → RN-04, RN-09…RN-12, RN-16; NFR-001 → RN-13; UX-NAV → RN-01…RN-06; UX-HOME → RN-13; UX-STATE → RN-12; UX-DS → RN-07, RN-08, RN-15; UX-RULES → RN-14.

## Impacto em domínio, arquitetura e dados

### Domínio, dados e sync
Sem mudança: nenhum SQL, Dexie `version()`, sync ou RPC. O Início lê dados que já existem localmente (serviços do B3, atribuições e vagas do B4). Sem os dados do B4, os cartões de escala ficam ocultos, não vazios.

### Arquitetura
- Camadas: UI apenas (`src/pages`, `src/components`, `src/App.tsx`, CSS). Casos de uso de leitura para o Início (`getHomeSummary`) em `application/` quando a lógica de "próximo serviço" e "pendências" ultrapassar uma consulta simples; domínio puro para a seleção do "próximo serviço".
- ADR-055 (Accepted): tokens em CSS custom properties, sem biblioteca de UI.
- Arquivos: `src/styles/tokens.css` (novo) importado antes de `index.css`; `src/cantum-theme.css` passa a consumir os tokens; `src/App.tsx` (cabeçalho e navegação); páginas novas finas para `/servicos`, `/bandas`, `/mais`.
- **Dono de config:** o lead adiciona `eslint-plugin-jsx-a11y` (regras no `eslint.config.js`) e uma biblioteca de `axe` para testes (ex.: `vitest-axe`). Ambas são dependências de desenvolvimento, não de UI, e entram em PR de `chore/a11y-lint` com justificativa.
- Documentação: `docs/DESIGN_TOKENS.md` (lista de tokens e uso), mantida junto do `tokens.css`.

### Tokens (primeiro corte, ADR-055)
`--color-bg`, `--color-surface`, `--color-surface-raised`, `--color-border`, `--color-text`, `--color-text-muted`, `--color-primary` (verde, ação), `--color-primary-strong`, `--color-on-primary`, `--color-danger`, `--color-warning`, `--color-success`, `--color-info`, `--color-focus`; `--space-1…8`; `--radius-sm/md/lg/pill`; `--font-sans`, `--font-mono`, `--font-size-*`, `--line-height-*`; `--shadow-soft`; `--size-touch-min: 44px`; `--size-touch-stage: 48px`. Variantes `[data-theme='dark']` (padrão) e `[data-theme='light']`; `@media (prefers-contrast: more)` ajusta bordas e texto. O Palco usa o subconjunto `--stage-*` derivado dos mesmos tokens, sem redesenho.

## Fora do escopo
- Redesenho do Modo Palco além de tokens e do tamanho dos alvos de toque (D6).
- Identidade visual comercial (logo, marca) e tipografia customizada (webfont).
- Biblioteca de ícones ou de componentes (ADR-055): ícones SVG inline, só os necessários.
- Bloco de atividade do sistema no Início (B7); Network (B10); notificações visuais além de badges.
- Modo de alto contraste próprio e escolha "Sistema" no tema.
- Aposentar as rotas `/organizations*` (continuam válidas).
- Internacionalização: textos de UI seguem em pt-BR.

## Plano de testes
- **Domínio / application:** seleção do "próximo serviço" e das pendências do Início por papel (sem dados, só serviços, com escala).
- **UI (papel/label acessível):** `AppNav` por papel e largura (mobile 5 destinos, desktop lateral), `aria-current`, "Meus serviços" por papel; tema padrão escuro e persistência; Início por papel (novo, membro, líder); badges por estado com texto; tela Músicas com as ações movidas.
- **Acessibilidade automatizada:** `eslint-plugin-jsx-a11y` sem erros; `axe` nas páginas principais (Início, Serviços, Músicas, Bandas, Mais, Serviço, Auth) nos dois temas.
- **Alvo de toque:** teste de componente verifica `min-height`/`min-width` ≥ 44 px dos controles de `Button`, `AppNav`, `Tabs`, `Field`; checagem dos controles do Palco em CSS ou por teste de computed style onde o jsdom permitir.
- **Manual:** celular, tablet e desktop; navegação por teclado; leitor de tela (VoiceOver/TalkBack) nas telas principais; contraste dos estados de foco e desabilitado; `prefers-contrast: more`, `forced-colors` e `prefers-reduced-motion`; Modo Palco no celular em retrato e paisagem, com polegar.

## Riscos
| Risco | Mitigação |
|---|---|
| O redesenho conflita com telas em construção (B2–B4) | Entregar tokens e navegação primeiro; telas de feature já nascem com tokens; migração das antigas por demanda |
| Ampliar alvos de toque desalinha o layout do Palco | Mudança só de `min-height`/`padding`; revisar em retrato e paisagem; sem alterar a hierarquia (D6) |
| Dois temas dobram o esforço de contraste | Tokens por tema e `axe` em ambos; ferramenta de verificação de contraste no teste |
| Barra inferior cobre conteúdo e o botão fixo do Palco | `padding-bottom` com `env(safe-area-inset-bottom)`; sem barra no Palco |
| "Meus serviços" depende do B4 | O item aparece como aba de Serviços; sem a rota do B4, a aba fica oculta (flag simples) |
| Rotas e textos antigos em testes existentes | Rotas antigas preservadas; ajustar só testes do cabeçalho |
| Dependências de desenvolvimento novas (`jsx-a11y`, `axe`) | PR próprio do lead com justificativa; sem dependência de runtime |

## Decisões fechadas (Jota, 2026-10-11)
As oito propostas abaixo foram **aprovadas** pelo owner, repassadas pelo lead; `/meus-servicos` abre a aba "Meus serviços" dentro de Serviços.
1. **"Meus serviços" dentro de "Serviços"** (abas), mantendo 5 destinos, em vez de um sexto destino ou de trocar "Serviços". Recomendo: padrão de mercado limita a barra inferior a 5.
2. **Breakpoint da barra lateral em 900 px**; abaixo, barra inferior. Recomendo: tablet em retrato fica com a barra inferior, mais próxima do uso no palco.
3. **Tema padrão escuro**, com a escolha salva respeitada, em vez de seguir o sistema. Recomendo: Blueprint §61 e o uso em ambiente de pouca luz; revisar se o público pedir "Sistema".
4. **Alvo de toque de 44 px em todo o app e piso de 44 px no Palco, primários a 48 px**, acima do mínimo AA de 24 px. Recomendo: valor usual em guias de plataforma e coerente com o achado do QA.
5. **Alto contraste só via `prefers-contrast` e `forced-colors`**, sem toggle próprio. Recomendo: menos superfície, atende a quem precisa.
6. **Sem biblioteca de UI nem de ícones; fonte do sistema** (sem webfont). Recomendo: PWA offline e carga rápida.
7. **`eslint-plugin-jsx-a11y` e uma biblioteca de `axe` como dev dependencies**, em PR do lead.
8. **Início mostra cartões de escala só quando os dados do B4 existem**, sem placeholders vazios.

## Issues
- [ ] Épico B5 / VS-05
- [ ] `docs/design-system-adr` — esta spec + ADR-055 (planner, lead revisa)
- [ ] `feat/design-tokens-dark-default` — `tokens.css`, `docs/DESIGN_TOKENS.md`, tema, migração do `cantum-theme.css`, alvos de toque do Palco (ui-engineer)
- [ ] `feat/app-navigation` — `AppNav` mobile/desktop, `/servicos`, `/bandas`, `/mais`, cabeçalho limpo (ui-engineer)
- [ ] `feat/home-contextual` — Início por papel; `getHomeSummary` se necessário (core-engineer + ui-engineer; depende do B4)
- [ ] `chore/a11y-lint` — `jsx-a11y` + `axe` (lead)
