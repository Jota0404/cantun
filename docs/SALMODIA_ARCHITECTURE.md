# Salmodia — Architecture Decision Record

**Documento:** Pedra Angular da Arquitetura  
**Versão:** 0.1  
**Status:** Accepted / Baseline  
**Última atualização:** 2026-08-21

---

# 1. Propósito

Este documento registra a arquitetura técnica do Salmodia e as decisões que devem orientar sua implementação.

Ele existe para preservar coerência técnica ao longo do desenvolvimento, especialmente durante o uso de ferramentas de IA.

## Regra principal

> Uma decisão registrada como **Accepted** não deve ser alterada durante a implementação sem que exista uma nova decisão documentada justificando a mudança.

O documento de arquitetura não deve ser tratado como sugestão. Ele representa o estado técnico aceito do projeto.

---

# 2. Objetivos Arquiteturais

A arquitetura deve:

- priorizar simplicidade;
- suportar uso offline;
- funcionar como PWA;
- ser adequada para tablet e celular;
- manter boa legibilidade do código;
- permitir evolução futura para backend/sincronização;
- facilitar testes;
- separar interface de regras de negócio;
- evitar acoplamento desnecessário;
- evitar overengineering.

---

# 3. Stack Oficial do MVP

| Camada | Tecnologia | Status |
|---|---|---|
| Linguagem | TypeScript | Accepted |
| UI | React | Accepted |
| Build | Vite | Accepted |
| PWA | vite-plugin-pwa | Accepted |
| Banco local | IndexedDB | Accepted |
| Abstração IndexedDB | Dexie | Accepted |
| Roteamento | React Router | Accepted |
| Testes unitários | Vitest | Accepted |
| Testes de componentes | React Testing Library | Accepted |
| E2E | Playwright | Futuro / conforme necessidade |
| Versionamento | Git | Accepted |
| Repositório | GitHub | Accepted |
| Backend | Nenhum no MVP | Accepted |
| Auth | Nenhum no MVP | Accepted |

Redux não será utilizado no MVP.

---

# 4. Visão Arquitetural

```text
                    SALMODIA
                       │
                       ▼
             ┌───────────────────┐
             │ React + TypeScript│
             │ Presentation      │
             └────────┬──────────┘
                      │
                      ▼
             ┌───────────────────┐
             │ Application Layer │
             │ Casos de uso      │
             └────────┬──────────┘
                      │
                      ▼
             ┌───────────────────┐
             │ Domain Layer      │
             │ Regras de negócio │
             └────────┬──────────┘
                      │
                      ▼
             ┌───────────────────┐
             │ Repository Layer  │
             │ Acesso a dados    │
             └────────┬──────────┘
                      │
                      ▼
             ┌───────────────────┐
             │ Dexie / IndexedDB │
             └───────────────────┘

             Vite + PWA envolvem a aplicação.
```

---

# 5. Estilo Arquitetural

A aplicação adota uma arquitetura em camadas leves:

1. Presentation
2. Application
3. Domain
4. Infrastructure / Data Access

A separação existe para manter limites claros e permitir evolução, não para criar abstrações excessivas.

---

# 6. Presentation Layer

Responsável por:

- páginas;
- componentes;
- interação do usuário;
- navegação;
- apresentação de estado;
- adaptação responsiva.

A Presentation Layer não deve manipular diretamente o IndexedDB.

Exemplos:

```text
pages/
components/
hooks de UI
```

---

# 7. Application Layer

Responsável pelos casos de uso da aplicação.

Exemplos:

```text
createSong
updateSong
deleteSong
createSetlist
addSongToSetlist
removeSongFromSetlist
reorderSetlist
startStageMode
```

A camada deve coordenar operações entre interface, domínio e persistência.

---

# 8. Domain Layer

Responsável pelas regras independentes da interface.

Exemplos:

- transposição de acordes;
- validação de BPM;
- validação de música;
- regras de ordenação;
- regras musicais.

A lógica de transposição não deve ficar dentro de componentes React.

---

# 9. Infrastructure / Data Access

Responsável por tecnologias específicas.

No MVP:

```text
Dexie
    ↓
IndexedDB
```

A aplicação não deve espalhar chamadas diretas ao Dexie pelos componentes.

---

# 10. Repository Pattern

Acesso ao banco deve passar por repositórios.

Exemplo conceitual:

```ts
songRepository.getById(id)
songRepository.getAll()
songRepository.create(song)
songRepository.update(song)
songRepository.delete(id)
```

A UI não deve executar diretamente:

```ts
db.songs.where(...)
```

Essa separação prepara a aplicação para uma futura troca ou adição de persistência remota.

---

# 11. Persistência Local

## Decisão

O IndexedDB é a fonte de verdade do MVP.

## Motivo

O aplicativo deve funcionar offline, armazenar múltiplas entidades e manter dados persistentes no dispositivo.

## Abstração

Dexie será utilizado para simplificar o acesso ao IndexedDB.

## Não utilizar

O MVP não deve usar `localStorage` como banco principal.

---

# 12. Modelo de Dados

## Song

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

## Setlist

```ts
interface Setlist {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}
```

## SetlistSong

```ts
interface SetlistSong {
  id: string
  setlistId: string
  songId: string
  position: number
}
```

---

# 13. IDs

Entidades utilizarão UUIDs.

Motivo:

- menor risco de colisão;
- melhor compatibilidade com futura sincronização;
- independência de sequência numérica local.

---

# 14. Datas

Datas serão armazenadas como strings ISO 8601.

Exemplo:

```text
2026-08-21T18:30:00.000Z
```

---

# 15. MusicalKey

Não utilizar strings arbitrárias espalhadas pelo projeto.

Criar um tipo controlado, por exemplo:

```ts
type MusicalKey =
  | 'C'
  | 'C#'
  | 'Db'
  | 'D'
  | 'D#'
  | 'Eb'
  | 'E'
  | 'F'
  | 'F#'
  | 'Gb'
  | 'G'
  | 'G#'
  | 'Ab'
  | 'A'
  | 'A#'
  | 'Bb'
  | 'B'
```

A implementação poderá posteriormente adotar uma representação interna numérica se isso simplificar a transposição, mantendo a API de domínio legível.

---

# 16. Estratégia de Cifra

O banco armazena a cifra inicialmente como texto:

```ts
lyrics: string
```

A aplicação não deve transformar o banco em uma estrutura complexa de acordes no MVP apenas por antecipação.

Entretanto, a camada de domínio deve permitir interpretação da cifra para transposição.

Fluxo conceitual:

```text
texto salvo
    ↓
parser de cifra
    ↓
estrutura temporária
    ↓
transposição
    ↓
texto renderizado
```

---

# 17. Transposição

A transposição deve ser independente da UI.

Conceitos esperados:

```text
transposeChord(chord, semitones)
transposeSongLyrics(lyrics, semitones)
```

A letra não é modificada.

O sistema deve preservar o tom original e evitar degradação da cifra causada por múltiplas transposições consecutivas.

A representação base da cifra deve permanecer estável; a versão transposta deve ser derivada para apresentação quando possível.

---

# 18. Estado do Modo Palco

O estado de sessão pode conter:

```ts
interface StageState {
  currentSongIndex: number
  fontSize: number
  autoScrollEnabled: boolean
  autoScrollSpeed: number
}
```

Esse estado não precisa ser persistido no banco no MVP.

---

# 19. Roteamento

Usar React Router.

Rotas conceituais:

```text
/
/songs
/songs/:id
/songs/new
/setlists
/setlists/:id
/stage/:setlistId
/stage/:setlistId/song/:songId
```

A rota de palco representa uma experiência distinta da administração.

---

# 20. Estado Global

Não utilizar Redux no MVP.

Priorizar:

- React state;
- hooks;
- context somente quando houver necessidade real.

Exemplos futuros:

```text
useSongs()
useSetlists()
useStage()
```

Se a necessidade de estado global crescer, uma biblioteca como Zustand pode ser avaliada posteriormente mediante nova decisão arquitetural.

---

# 21. PWA

O aplicativo será uma PWA.

Objetivos:

- instalação no dispositivo;
- comportamento semelhante a aplicativo;
- cache do app shell;
- funcionamento offline;
- compatibilidade com Android;
- possibilidade de evolução para iOS.

O service worker não deve ser usado como armazenamento da biblioteca de músicas.

A biblioteca pertence ao IndexedDB.

---

# 22. Offline

Fluxo esperado:

```text
primeiro acesso com internet
        ↓
PWA instalado
        ↓
app shell em cache
        ↓
dados no IndexedDB
        ↓
internet desligada
        ↓
aplicação continua funcionando
```

Nenhuma funcionalidade essencial do MVP poderá depender de API externa.

---

# 23. Desempenho

Especial atenção ao Modo Palco.

Evitar:

- re-renderizações desnecessárias;
- parsing repetido da cifra;
- consultas repetidas ao banco;
- componentes excessivamente grandes;
- animações pesadas.

A cifra deve ser processada de forma eficiente e, quando possível, antes da renderização final.

---

# 24. Acessibilidade

Aplicar no mínimo:

- labels em botões;
- contraste adequado;
- tamanho adequado para touch;
- navegação por teclado em desktop;
- foco visível quando aplicável;
- não depender somente de cor.

---

# 25. Testes

## Unitários

Prioridade:

- transposição;
- validação de BPM;
- validação de música;
- manipulação de repertórios.

## Integração

- criar música;
- editar música;
- excluir música;
- criar repertório;
- adicionar música;
- reordenar.

## Manual

Especial atenção a:

- tablet;
- celular;
- Modo Palco;
- offline;
- rotação de tela;
- auto-scroll.

---

# 26. Estrutura de Projeto Inicial

```text
src/
│
├── app/
│   ├── App.tsx
│   ├── routes.tsx
│   └── providers/
│
├── pages/
│   ├── Library/
│   ├── Song/
│   ├── Setlists/
│   └── Stage/
│
├── components/
│   ├── ui/
│   ├── song/
│   ├── setlist/
│   └── stage/
│
├── features/
│   ├── songs/
│   ├── setlists/
│   ├── transpose/
│   └── stage/
│
├── domain/
│   ├── songs/
│   ├── setlists/
│   └── music/
│
├── db/
│   ├── database.ts
│   ├── schema.ts
│   └── repositories/
│
├── hooks/
├── utils/
├── types/
├── styles/
└── main.tsx
```

A estrutura não deve ser criada integralmente de uma vez. Diretórios devem surgir conforme as funcionalidades exigirem.

---

# 27. Princípios de Arquitetura

1. **Simplicidade antes de abstração.**
2. **Separação sem overengineering.**
3. **A UI não conhece o banco diretamente.**
4. **Regras de negócio não dependem de React.**
5. **Tecnologia de persistência fica isolada.**
6. **O MVP não deve antecipar complexidade futura.**
7. **Decisões arquiteturais relevantes devem ser registradas.**
8. **Mudanças em decisões Accepted exigem revisão.**
9. **Funcionalidades futuras não justificam complexidade presente sem necessidade real.**

---

# 28. Architecture Decision Records (ADR)

## ADR-001 — Aplicação Local-First

**Status:** Accepted  
**Data:** 2026-08-21

### Decisão

O MVP utilizará IndexedDB como armazenamento principal e funcionará sem backend.

### Motivo

O uso offline é um requisito fundamental. O primeiro usuário utilizará o aplicativo em situações em que a disponibilidade de internet não pode ser considerada garantida.

### Consequências

- dados ficam inicialmente no dispositivo;
- não existe sincronização no MVP;
- a arquitetura deve permitir futura sincronização.

---

## ADR-002 — React + TypeScript + Vite

**Status:** Accepted  
**Data:** 2026-08-21

### Decisão

O frontend será construído com React, TypeScript e Vite.

### Motivo

A aplicação é predominantemente client-side, não necessita de SSR/backend integrado no MVP e precisa de uma base moderna, tipada e simples para desenvolvimento de uma PWA.

### Consequências

- aplicação client-side;
- build rápida;
- TypeScript para segurança de tipos;
- sem dependência de Next.js no MVP.

---

## ADR-003 — PWA

**Status:** Accepted  
**Data:** 2026-08-21

### Decisão

O produto será implementado inicialmente como PWA.

### Motivo

Permite uma base de código única para uso em dispositivos móveis e desktop e atende ao objetivo de instalação e funcionamento semelhante a aplicativo.

### Consequências

- app instalável;
- necessidade de service worker/app shell;
- atenção a limitações específicas de cada navegador/plataforma.

---

## ADR-004 — Dexie sobre IndexedDB

**Status:** Accepted  
**Data:** 2026-08-21

### Decisão

Dexie será utilizado como camada de abstração sobre IndexedDB.

### Motivo

IndexedDB atende ao requisito de persistência local, enquanto Dexie reduz a complexidade de acesso ao banco sem esconder completamente suas capacidades.

### Consequências

- dependência adicional pequena e justificada;
- acesso ao banco mais legível;
- repository layer permanece acima do Dexie.

---

## ADR-005 — Repository Layer

**Status:** Accepted  
**Data:** 2026-08-21

### Decisão

O acesso ao banco deverá ocorrer por meio de repositories.

### Motivo

Evitar acoplamento entre componentes e IndexedDB e preparar a aplicação para eventual substituição ou coexistência com persistência remota.

### Consequências

- mais uma camada de código;
- maior testabilidade;
- possibilidade de trocar infraestrutura sem reescrever a UI.

---

## ADR-006 — Separação Presentation / Application / Domain / Infrastructure

**Status:** Accepted  
**Data:** 2026-08-21

### Decisão

A aplicação adotará camadas leves de Presentation, Application, Domain e Infrastructure/Data Access.

### Motivo

Separar interface de regras de negócio e tecnologia de persistência sem cair em uma arquitetura excessivamente complexa.

### Consequências

- limites claros entre responsabilidades;
- maior organização;
- pequenas camadas extras;
- necessidade de evitar abstrações sem valor real.

---

## ADR-007 — Transposição Independente da UI

**Status:** Accepted  
**Data:** 2026-08-21

### Decisão

A lógica de transposição será implementada no domínio e não dentro de componentes React.

### Motivo

A transposição é regra de negócio musical e deve poder ser testada e reutilizada independentemente da interface.

### Consequências

- melhor testabilidade;
- maior reutilização;
- componentes de UI mais simples.

---

## ADR-008 — Sem Redux no MVP

**Status:** Accepted  
**Data:** 2026-08-21

### Decisão

Redux não será utilizado no MVP.

### Motivo

A complexidade de estado prevista não justifica a adoção de uma biblioteca global de estado neste estágio.

### Consequências

- menos dependências;
- menor complexidade inicial;
- possibilidade de introduzir Zustand ou outra solução futuramente se a necessidade surgir.

---

## ADR-009 — Cifra como Texto no Banco

**Status:** Accepted  
**Data:** 2026-08-21

### Decisão

A cifra/letra será armazenada como string no banco no MVP.

### Motivo

É a solução mais simples para importação, edição e preservação da formatação inicial.

### Consequências

- parser de cifra ficará na camada de domínio;
- estrutura do banco permanece simples;
- evolução para representação estruturada poderá ocorrer futuramente.

---

## ADR-010 — Sem Backend no MVP

**Status:** Accepted  
**Data:** 2026-08-21

### Decisão

Não haverá backend, autenticação ou sincronização no MVP.

### Motivo

O objetivo é validar o produto e o fluxo de uso antes de introduzir complexidade de infraestrutura remota.

### Consequências

- simplicidade de desenvolvimento;
- ausência de sincronização entre dispositivos;
- necessidade futura de backup/sincronização se o produto crescer.

---

# 29. Regra de Evolução da Arquitetura

A arquitetura pode mudar.

Mas mudanças devem ocorrer por meio de uma decisão explícita, contendo no mínimo:

- identificador do novo ADR;
- decisão anterior;
- nova decisão;
- motivo da mudança;
- impactos;
- data;
- status.

Nunca substituir silenciosamente uma decisão Accepted.

---

# 30. Estado Atual da Arquitetura

### Accepted

- React
- TypeScript
- Vite
- PWA
- IndexedDB
- Dexie
- React Router
- Repository Layer
- camadas leves Presentation/Application/Domain/Infrastructure
- UUID
- ISO 8601
- transposição separada da UI
- React state/hooks em vez de Redux
- sem backend no MVP
- sem login no MVP
- arquitetura preparada para evolução futura

### Futuro / não decidido

- Supabase
- PostgreSQL remoto
- autenticação
- sincronização
- Zustand
- Playwright obrigatório
- sistema de backup
- integração MIDI
- pedal Bluetooth
- arquitetura nativa Android/iOS

---

# 15. Architecture Decision Record Index

The following decisions are part of the accepted architecture baseline:

| ID | Decision | Status |
|---|---|---|
| ADR-001 | Local-first / IndexedDB | Accepted |
| ADR-002 | React + TypeScript + Vite | Accepted |
| ADR-003 | PWA | Accepted |
| ADR-004 | Dexie for IndexedDB | Accepted |
| ADR-005 | Repository Layer | Accepted |
| ADR-006 | Lightweight layered architecture | Accepted |
| ADR-007 | Transposition as domain logic | Accepted |
| ADR-008 | No Redux in MVP | Accepted |

Individual ADR files belong under `docs/adr/`.

---

# 16. Git/GitHub Development Constraints

The GitHub repository is private during initial development.
GitHub Issues are used from the beginning.
Pull Requests are used for relevant changes.

`main` represents the stable/functional branch.
Task branches use:

```text
feature/*
fix/*
refactor/*
docs/*
test/*
```

Claude is not assumed to have direct GitHub or Git operation capabilities in the development environment. The developer applies generated changes, runs tests, commits, pushes, and manages Pull Requests.

---

# 16. ADR Index

| ID | Decisão | Status |
|---|---|---|
| ADR-001 | Local-first com IndexedDB | Accepted |
| ADR-002 | React + TypeScript + Vite | Accepted |
| ADR-003 | PWA | Accepted |
| ADR-004 | Dexie | Accepted |
| ADR-005 | Repository Layer | Accepted |
| ADR-006 | Arquitetura em camadas leves | Accepted |
| ADR-007 | Transposição como lógica de domínio | Accepted |
| ADR-008 | Sem Redux no MVP | Accepted |
| ADR-009 | Desenvolvimento assistido por IA com controle humano | Accepted |
| ADR-010 | Documentation-first | Accepted |

Os textos completos dos ADRs ficam em `docs/adr/`.

---

# 17. Git/GitHub e fluxo de integração

O repositório será privado no início. GitHub Issues será utilizado desde o começo e Pull Requests serão utilizados para mudanças relevantes.

`main` representa um estado funcional e estável. Branches de trabalho seguirão os prefixos:

- `feature/*`
- `fix/*`
- `refactor/*`
- `docs/*`
- `test/*`

Claude não é tratado como tendo acesso operacional garantido ao Git/GitHub. O fluxo oficial é:

```text
Issue
  ↓
Branch
  ↓
Claude + desenvolvedor
  ↓
Alterações produzidas
  ↓
Desenvolvedor aplica e testa
  ↓
Commit
  ↓
Push
  ↓
Pull Request
  ↓
Review
  ↓
Merge
  ↓
main
```

---

# 18. Ordem de implementação

A ordem oficial do MVP é:

```text
VS-00  Documentação
VS-01  Primeira música
VS-02  Biblioteca
VS-03  Transposição
VS-04  Repertórios
VS-05  Execução
VS-06  Modo Palco
VS-07  Auto-scroll
VS-08  Importação
VS-09  Offline/PWA
VS-10  Refinamento + validação real
```

---

# 19. Vertical Slices

Vertical Slices são os grandes marcos funcionais do projeto. O detalhamento operacional de cada slice ficará no GitHub, por meio de Issues e, quando aplicável, Pull Requests.

Não haverá uma pasta `docs/slices/` no MVP.

Cada slice deve produzir um estado funcional, testável e recuperável.

---

# 20. Testes e validação

A estratégia de qualidade possui quatro níveis:

1. testes unitários;
2. testes de integração;
3. testes E2E;
4. testes manuais em dispositivos reais.

A validação final do MVP também inclui uso real com o usuário inicial.

Definition of Done de uma Issue:

```text
[ ] Código implementado
[ ] Código compilando
[ ] Testes relevantes passando
[ ] Sem erro conhecido relacionado
[ ] Fluxo manual verificado
[ ] Documentação atualizada quando necessário
[ ] Git diff revisado
[ ] Alteração dentro do escopo da Issue
[ ] Pronta para commit
```

Definition of Done de um Vertical Slice:

```text
[ ] Todas as Issues concluídas
[ ] Fluxo completo funcionando
[ ] Testes automatizados passando
[ ] Teste manual executado
[ ] Sem regressões conhecidas
[ ] Documentação atualizada
[ ] PR revisado
[ ] Merge em main
```
