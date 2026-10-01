# CANTUM — AI Context

> Contexto operacional para agentes de IA que trabalham no projeto CANTUM.

## 1. Identidade do projeto

**Nome:** CANTUM (nome provisório)

**Objetivo:** aplicativo offline para músicos de igreja armazenarem suas versões personalizadas de cifras, organizarem repertórios e executarem as músicas em um modo de palco otimizado para celular e tablet.

**Usuário inicial:** pai do desenvolvedor, com possibilidade de evolução para um produto comercial.

---

## 2. Fontes de verdade

Antes de alterar código, considere estas fontes, nesta ordem:

1. `SALMODIA_PRODUCT.md` — requisitos e escopo do produto.
2. `SALMODIA_ARCHITECTURE.md` — arquitetura e decisões técnicas.
3. `docs/adr/` — decisões arquiteturais individuais e seus motivos.
4. `AI_CONTEXT.md` — contexto operacional resumido para IA.
5. Código existente — implementação atual, que pode conter bugs ou estar incompleta.
6. Suposições da IA — última prioridade.

Uma instrução casual não deve substituir silenciosamente uma decisão arquitetural `Accepted`.

---

## 3. Estado atual

### Concluído

- visão do produto definida;
- MVP v0.1 definido;
- arquitetura técnica definida;
- estratégia de documentação definida;
- estratégia de trabalho com IA definida.

### Em andamento

- preparação da base documental do projeto.

### Próximos passos

- configurar Git/GitHub;
- inicializar o projeto React + TypeScript + Vite;
- configurar PWA;
- configurar IndexedDB + Dexie;
- iniciar implementação em vertical slices.

Este bloco deve ser atualizado conforme o projeto evoluir.

---

## 4. Stack atual

- React
- TypeScript
- Vite
- PWA
- IndexedDB
- Dexie
- React Router
- Vitest
- React Testing Library
- Git/GitHub

### Estado global

Não utilizar Redux no MVP.

React state e hooks são suficientes inicialmente.

Zustand ou outra solução só deve ser introduzida se existir necessidade real.

---

## 5. Arquitetura resumida

Arquitetura em camadas leves:

```text
Presentation
    ↓
Application
    ↓
Domain
    ↓
Infrastructure
```

Fluxo de dados:

```text
React UI
   ↓
Application logic
   ↓
Domain logic
   ↓
Repository
   ↓
Dexie
   ↓
IndexedDB
```

A UI não deve acessar IndexedDB/Dexie diretamente.

---

## 6. Modelo de dados principal

Entidades do MVP:

```text
Song
Setlist
SetlistSong
```

### Song

```ts
interface Song {
  id: string
  title: string
  artist?: string
  originalKey: MusicalKey
  currentKey: MusicalKey
  bpm?: number
  lyrics: string
  notes?: string
  isFavorite: boolean
  createdAt: string
  updatedAt: string
}
```

### Setlist

```ts
interface Setlist {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}
```

### SetlistSong

```ts
interface SetlistSong {
  id: string
  setlistId: string
  songId: string
  position: number
}
```

IDs devem utilizar UUID.

Datas devem utilizar ISO 8601.

---

## 7. Regras importantes do domínio

### Música

- título é obrigatório;
- artista é opcional no MVP;
- tom original deve ser preservado;
- tom atual pode ser alterado;
- BPM é inteiro de 1 a 999 e é principalmente informativo;
- cifra/letra é armazenada como texto estruturado;
- observações são texto livre;
- uma música pode pertencer a vários repertórios.

### Transposição

A transposição deve ser implementada como lógica de domínio independente da UI.

Não modificar permanentemente a cifra base a cada clique de transposição.

A letra deve permanecer intacta.

### Repertório

- possui nome e lista ordenada de músicas;
- músicas podem aparecer em vários repertórios;
- ordem é representada por `position` em `SetlistSong`;
- repertórios podem ser duplicados sem duplicar músicas da biblioteca.

---

## 8. Modo Palco

O Modo Palco é a parte mais importante da experiência de uso.

Prioridades:

- leitura fácil;
- interface escura;
- alto contraste;
- poucos controles;
- botões grandes;
- navegação anterior/próxima;
- rolagem manual;
- auto-scroll;
- controle de velocidade por slider;
- controle de tamanho da fonte;
- fullscreen quando disponível;
- tentativa de manter a tela ativa quando suportado.

Ao trocar de música, iniciar no topo e reiniciar o auto-scroll.

---

## 9. Offline / PWA

O MVP é local-first.

Não existe backend, login ou sincronização no MVP.

IndexedDB é a fonte de verdade local.

A aplicação deve continuar funcionando sem internet depois de instalada/carregada.

O service worker deve armazenar o app shell e recursos necessários; os dados das músicas pertencem ao IndexedDB.

A arquitetura deve permitir futura migração/sincronização com Supabase sem exigir reescrita completa do domínio.

---

## 10. Princípios de implementação

Prioridade:

1. correção;
2. aderência ao produto;
3. aderência à arquitetura;
4. simplicidade;
5. manutenção;
6. desempenho;
7. extensibilidade futura.

Evitar overengineering.

Não criar abstrações, patterns, services, hooks ou componentes genéricos sem necessidade concreta.

Não introduzir dependências sem justificativa.

Não alterar arquivos não relacionados à tarefa sem necessidade.

Não refatorar código não relacionado apenas por preferência estética.

Antes de criar uma solução nova, verificar se o projeto já possui uma solução equivalente.

---

## 11. Regras para mudanças arquiteturais

Decisões com status `Accepted` não devem ser alteradas silenciosamente.

A IA pode:

- identificar problemas;
- questionar decisões;
- sugerir alternativas;
- apresentar trade-offs;
- propor melhorias.

A IA não deve:

- substituir uma decisão `Accepted` sem aprovação explícita;
- introduzir backend no MVP sem solicitação;
- trocar IndexedDB por outro armazenamento sem aprovação;
- adicionar Redux ou outra solução global sem necessidade e aprovação;
- expandir o escopo do MVP por iniciativa própria.

Quando uma melhoria exigir alteração arquitetural, registrar ou propor um novo ADR antes da implementação.

---

## 12. Como trabalhar em uma tarefa

Para tarefas simples:

1. entender o pedido;
2. localizar o código relevante;
3. implementar a menor mudança necessária;
4. testar;
5. resumir o resultado.

Para tarefas significativas:

1. analisar o estado atual;
2. identificar arquivos afetados;
3. identificar riscos/dependências;
4. implementar;
5. testar;
6. informar problemas ou decisões relevantes.

Não gerar planejamento longo para tarefas triviais.

---

## 13. Como responder

Respostas devem ser diretas e econômicas em tokens.

Formato preferencial:

```text
Resultado
Alterações principais
Problemas/riscos
Testes executados
Próximo passo, quando relevante
```

Não repetir o contexto inteiro do projeto.

Não explicar código trivial.

Explicar brevemente apenas quando houver:

- conceito novo;
- decisão arquitetural;
- trade-off;
- risco relevante;
- bug complexo.

Quando houver código suficiente para mostrar diretamente a alteração, preferir o código ao texto explicativo excessivo.

---

## 14. Sugestões

Claude deve agir também como revisor e parceiro técnico.

Pode sugerir melhorias em:

- arquitetura;
- código;
- UX;
- desempenho;
- segurança;
- testes;
- manutenção;
- funcionalidades futuras.

Sugestões devem ser separadas da implementação solicitada.

Formato recomendado:

```text
Sugestão: ...
Motivo: ...
Impacto: ...
Recomendação: ...
```

Uma sugestão não deve virar implementação automaticamente.

---

## 15. Economia de tokens

O projeto será desenvolvido com uso de uma versão com limite de contexto/tokens.

Portanto:

- não repetir documentos completos;
- não repetir arquivos inteiros quando só uma parte mudou;
- não explicar conceitos básicos sem necessidade;
- não gerar código não solicitado;
- não criar documentação redundante;
- não produzir resumos longos do que já está estabelecido;
- trabalhar por tarefas pequenas e isoladas.

Quando possível, referenciar nomes de arquivos, funções e linhas/trechos em vez de reproduzir grandes quantidades de conteúdo.

---

## 16. Desenvolvimento em vertical slices

Preferir entregas funcionais completas e pequenas.

Exemplo:

```text
Criar música
    ↓
Salvar
    ↓
Listar
    ↓
Abrir
    ↓
Visualizar
```

Depois:

```text
Criar repertório
    ↓
Adicionar música
    ↓
Ordenar
    ↓
Abrir
    ↓
Modo Palco
```

Cada slice deve ser testável antes de iniciar o seguinte.

---

## 17. Controle do escopo

MVP atual NÃO inclui:

- login;
- backend;
- sincronização;
- compartilhamento;
- colaboração;
- pedal Bluetooth;
- MIDI;
- integração com teclado;
- metrônomo;
- áudio;
- IA para geração de cifras;
- PDF/DOCX;
- tags/categorias;
- filtros avançados.

Essas ideias pertencem ao roadmap e não devem entrar automaticamente no MVP.

---

## 18. Git

Commits devem ser pequenos e relacionados a uma mudança.

Exemplos:

```text
feat: create song library
feat: add song editor
feat: add local song persistence
feat: create setlists
feat: add setlist ordering
feat: create stage mode
feat: add automatic scrolling
fix: preserve chord formatting
```

Não combinar várias funcionalidades independentes em um único commit sem necessidade.

---

## 19. Atualização deste contexto

Atualizar este arquivo quando houver mudança significativa em:

- arquitetura;
- escopo;
- estado do desenvolvimento;
- convenções de código;
- workflow com IA.

Não registrar aqui detalhes temporários de uma tarefa individual.

Este arquivo deve permanecer curto o suficiente para ser carregado como contexto frequente.

---

## 20. Regra final

O objetivo da IA no projeto é **acelerar o desenvolvimento e aumentar a qualidade**, não assumir a propriedade das decisões.

Claude deve implementar, revisar, debugar e sugerir.

O desenvolvedor continua responsável pelas decisões de produto e pela aprovação de mudanças arquiteturais.

## 11. Strategy for working with Claude

Claude is an assistant, not the owner of the project.

Claude may:
- analyze the codebase;
- implement requested changes by generating code;
- review code;
- debug problems;
- identify risks;
- suggest improvements to product, architecture, UX, performance, and maintainability.

Claude must NOT silently change an `Accepted` architecture decision.
If a requested change conflicts with an `Accepted` decision, Claude should:
1. identify the conflict;
2. explain the impact briefly;
3. suggest alternatives if useful;
4. wait for approval before changing the architecture.

Claude is explicitly encouraged to suggest improvements. Suggestions do not require implementation unless approved by the developer.

## 12. Claude Free / No Claude Code Workflow

The development environment does not assume Claude Code or direct GitHub/Git access.
Claude should be treated as a code-analysis and code-generation assistant working through project files/context supplied to it.

Expected workflow:

```text
Issue
  ↓
Developer creates/uses feature branch
  ↓
Relevant project files + context supplied to Claude
  ↓
Claude analyzes / suggests / generates changes
  ↓
Developer applies changes locally
  ↓
Developer runs tests and reviews diff
  ↓
Developer commits
  ↓
Developer pushes to GitHub
  ↓
Pull Request
  ↓
Review / merge
```

Claude should therefore generate changes in a form that is easy to apply manually when direct repository editing is unavailable.

Prefer:
- creating only files that are necessary;
- showing localized changes when possible;
- avoiding full-file rewrites unless the file is small or the rewrite is genuinely simpler;
- clearly identifying affected files;
- preserving unrelated code.

Do not assume Claude can create commits, push branches, open pull requests, or directly modify the GitHub repository.

## 13. Token-Efficient Communication

The developer uses Claude Free and wants to minimize token consumption.

Claude should:
- avoid repeating project context already available in the supplied documents;
- avoid long introductions;
- avoid explaining trivial code;
- prefer concise reasoning;
- provide detailed explanations only for complex concepts, architectural decisions, important trade-offs, or difficult bugs;
- avoid rewriting unrelated files;
- avoid unnecessary code duplication;
- ask for additional files/context only when genuinely necessary.

For significant changes, a short impact analysis is preferred before implementation:

```text
Files affected:
Dependencies:
Risks:
Implementation:
```

For trivial changes, skip the planning block and implement directly.

## 14. Development Workflow

Development is organized by task, not by individual AI conversation.

A task may involve several Claude interactions while remaining on the same Git branch.

Example:

```text
Issue #12 — Song CRUD
        ↓
feature/song-crud
        ↓
multiple Claude interactions
        ↓
local testing
        ↓
commit
        ↓
Pull Request
```

The developer is responsible for applying, reviewing, testing, committing, and pushing changes generated with Claude.

## 15. Suggestions and Architecture Changes

Claude should actively point out:
- conflicts with existing architecture;
- unnecessary complexity;
- duplicated logic;
- possible bugs;
- maintainability concerns;
- performance issues;
- opportunities for future improvement.

Suggestions should normally be concise and separated from implementation.

If an architectural improvement is accepted, document it through an ADR and update the relevant architectural documentation before or together with the implementation.

## 16. Response Style

Default response style:

```text
Result
Changes
Problems / Risks
Next step
```

Keep explanations minimal unless the task involves a complex or important concept.

When producing code:
- provide only the necessary files/changes;
- preserve existing conventions;
- do not refactor unrelated code;
- include tests when the change affects testable domain/application behavior.

## 17. Documentation Maintenance

When implementation changes a product requirement, architecture decision, or AI workflow, identify the affected documentation and propose/update it as appropriate.

Do not silently rewrite product or architecture decisions.

## 18. Git / GitHub Rules

The GitHub repository is private during initial development.

GitHub Issues will be used from the beginning.
Pull Requests will be used for relevant features and changes, even though the project is maintained by a single developer.

Primary branch:
- `main` — must remain functional/stable.

Task branches:
- `feature/*`
- `fix/*`
- `refactor/*`
- `docs/*`
- `test/*`

Commits should follow Conventional Commits where practical.

Examples:
- `feat: add song repository`
- `fix: preserve original key after transposition`
- `test: add transpose tests`
- `docs: update architecture ADR`

Claude does not own Git operations. The developer performs:
- branch creation;
- applying generated changes;
- testing;
- commit;
- push;
- pull request;
- merge.

A commit should represent one logical unit of change.

---

## 14. Ordem de Implementação

O projeto será desenvolvido em vertical slices.

### Fase 0 — Documentação e preparação

A documentação-base deve existir e ser versionada antes do primeiro código de aplicação:

- `README.md`
- `AI_CONTEXT.md`
- `docs/SALMODIA_PRODUCT.md`
- `docs/SALMODIA_ARCHITECTURE.md`
- `docs/adr/`

### Fases seguintes

1. Banco local
2. Song CRUD
3. Biblioteca
4. Transposição
5. Repertórios
6. Modo Palco
7. Auto-scroll
8. Importação
9. PWA/offline
10. Refinamento e validação com usuário real

Cada fase deve produzir uma parte funcional, testável e integrada ao projeto existente.

### Primeiro vertical slice de código

Depois da Fase 0, o primeiro slice será:

```text
Banco mínimo
  ↓
Song
  ↓
Criar
  ↓
Salvar
  ↓
Listar
  ↓
Abrir
```

Não construir toda a infraestrutura antes de entregar uma funcionalidade utilizável.

---

## 15. Estado do desenvolvimento

### Concluído

- especificação do produto;
- arquitetura técnica;
- estratégia de documentação;
- estratégia de uso do Claude;
- estratégia Git/GitHub;
- ordem de implementação.

### Próxima etapa

Definir os detalhes do primeiro ciclo de implementação e transformar a ordem de desenvolvimento em tarefas concretas.

## 15. Git/GitHub workflow

GitHub começa privado. Issues são utilizadas desde o início. Pull Requests são usados para mudanças relevantes.

Claude não deve ser tratado como tendo acesso operacional direto ao repositório. O desenvolvedor aplica alterações produzidas pela IA, testa, revisa o diff, faz commit, push e integração.

Fluxo:

```text
Issue → branch → Claude → aplicação manual → testes → commit → push → PR → merge
```

## 16. Ordem de implementação

```text
VS-00 Documentação
VS-01 Primeira música
VS-02 Biblioteca
VS-03 Transposição
VS-04 Repertórios
VS-05 Execução
VS-06 Modo Palco
VS-07 Auto-scroll
VS-08 Importação
VS-09 Offline/PWA
VS-10 Refinamento + validação real
```

## 17. Vertical Slices

Vertical Slices são os grandes marcos funcionais. O detalhamento operacional fica no GitHub Issues. Não criar `docs/slices/` no MVP.

Cada slice deve produzir algo funcional, testável e recuperável.

## 18. Testes e Definition of Done

A estratégia de testes usa unitários, integração, E2E e testes manuais em dispositivos reais. O teste com o usuário inicial é parte da validação do MVP.

Uma Issue só está concluída quando a implementação, testes relevantes, revisão manual, diff e escopo estiverem verificados.

Um Vertical Slice só está concluído quando suas Issues estiverem encerradas, o fluxo completo funcionar e houver validação manual, revisão e merge em `main`.

## 19. Documentation-first

A documentação é o primeiro estado versionado do projeto. O baseline documental deve existir antes do primeiro código de aplicação.

Arquivos principais:

```text
README.md
AI_CONTEXT.md
docs/SALMODIA_PRODUCT.md
docs/SALMODIA_ARCHITECTURE.md
docs/adr/
```
