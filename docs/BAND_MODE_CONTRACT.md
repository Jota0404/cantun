# CANTUM — Tarefa J: Contrato do Modo Banda

## Status

**Definição arquitetural / contrato de implementação**.

Esta documentação especifica o contrato da primeira versão do Modo Banda compartilhado. Ela não cria, por si só, banco, RPC, canal Realtime ou interface. A implementação posterior deve obedecer às invariantes aqui descritas.

## 1. Objetivo

O Modo Banda é uma **sessão operacional de palco compartilhada**.

O objetivo é permitir que o Music Director (MD) controle a apresentação em um dispositivo enquanto os demais músicos recebem o mesmo estado operacional em tempo real.

A sessão não transforma a biblioteca da banda em um documento colaborativo genérico. Ela é uma projeção temporária e controlada de um `BandSetlist`.

## 2. Hierarquia

```text
Band
  ↓
BandSetlist
  ↓
BandStageSession
  ↓
BandStageState
  ↓
Supabase Realtime Broadcast
  ↓
dispositivos dos músicos
```

### Responsabilidades

- `Band`: contêiner de pertencimento e autorização.
- `BandSetlist`: repertório oficial que servirá de base para a sessão.
- `BandStageSession`: ciclo de vida da apresentação compartilhada.
- `BandStageState`: estado operacional atual da sessão.
- `Supabase Realtime Broadcast`: transporte de eventos de baixa latência entre os participantes.
- Dispositivos: mantêm uma projeção local do estado recebido.

## 3. Conceitos e entidades

### 3.1 BandStageSession

Representa uma execução compartilhada de um setlist.

Campos mínimos previstos:

```ts
interface BandStageSession {
  id: string
  bandId: string
  setlistId: string
  mdUserId: string
  status: 'lobby' | 'live' | 'ended'
  createdAt: string
  startedAt?: string
  endedAt?: string
  updatedAt: string
}
```

Invariantes:

1. A sessão pertence a exatamente uma `Band`.
2. A sessão usa exatamente um `BandSetlist`.
3. Existe exatamente um `mdUserId` operacional por sessão.
4. Apenas uma sessão pode estar `live` para o mesmo contexto de apresentação definido pela camada de aplicação.
5. Encerrar a sessão torna inválidas novas mutações operacionais nela.

### 3.2 BandStageState

Representa o estado operacional corrente da sessão.

Campos mínimos previstos:

```ts
interface BandStageState {
  sessionId: string
  revision: number
  currentIndex: number
  currentSongId?: string
  currentKey?: MusicalKey
  isRunning: boolean
  updatedAt: string
}
```

A implementação pode adicionar campos, mas não deve duplicar em `BandStageState` informações de catálogo que pertencem ao `BandSong` ou à composição do `BandSetlistSong`.

## 4. Fonte de verdade

Durante uma sessão `live`:

> **O estado operacional aceito é o último estado produzido pelo MD autorizado para aquela sessão.**

O cliente músico não possui autoridade para criar uma nova verdade concorrente.

A distinção é obrigatória:

- `BandSong` = conteúdo da música.
- `BandSongMemberState` = preferência/estado individual do membro, quando aplicável.
- `BandStageState` = estado compartilhado de palco.

Uma preferência individual, como tom pessoal persistido, não deve sobrescrever automaticamente o tom operacional compartilhado da sessão.

## 5. Autoridade operacional

O MD é determinado **na sessão**, por `mdUserId`.

O fato de um usuário ser `owner` ou `editor` em `BandMember` não concede, por si só, controle de palco.

Regras:

1. O servidor deve validar que `mdUserId` é membro autorizado da banda.
2. Criação/início de sessão exige autorização administrativa definida pela camada de domínio.
3. Com a sessão `live`, ações operacionais de palco aceitas pelo protocolo exigem que o emissor seja o `mdUserId` atual.
4. Troca de MD deve invalidar imediatamente a autoridade operacional anterior.
5. O cliente nunca decide localmente que se tornou MD.

## 6. Setlist como snapshot lógico

A sessão nasce a partir de um `BandSetlist`.

O setlist continua sendo a fonte de ordenação e identidade das músicas da apresentação, mas a sessão deve trabalhar com uma visão estável do repertório usado no palco.

Mudanças estruturais posteriores no setlist não devem alterar silenciosamente o que está em execução.

Para a primeira implementação, a regra recomendada é:

> Um `BandStageSession` em `live` não aceita alterações estruturais no conjunto ordenado de músicas.

Alterações futuras do repertório devem ocorrer fora da sessão ou originar nova sessão.

## 7. Protocolo de eventos

O Broadcast deve transportar eventos explícitos e versionáveis.

Envelope mínimo:

```ts
interface BandStageEvent<T> {
  type: BandStageEventType
  sessionId: string
  revision: number
  actorUserId: string
  eventId: string
  sentAt: string
  payload: T
}
```

Tipos iniciais:

```ts
type BandStageEventType =
  | 'stage.snapshot'
  | 'stage.play'
  | 'stage.pause'
  | 'stage.next'
  | 'stage.previous'
  | 'stage.goto'
  | 'stage.set-key'
  | 'stage.session-ended'
  | 'stage.md-changed'
```

`stage.snapshot` é usado para sincronização inicial/reconciliação.

Eventos operacionais devem ser idempotentes ou protegidos por `revision`.

## 8. Revisão e ordenação

A sessão usa um contador monotônico `revision`.

Regras:

1. Cada mudança operacional aceita gera uma nova revisão.
2. Um cliente deve ignorar eventos com `revision` menor ou igual à revisão já aplicada.
3. Um salto de revisão deve disparar reconciliação por snapshot quando necessário.
4. `eventId` deve permitir deduplicação de eventos repetidos.
5. Ordem de chegada local não é suficiente para determinar autoridade.

Exemplo:

```text
revision 41 → next
revision 42 → set-key
revision 43 → pause
```

Um evento `revision 42` recebido depois da `43` não pode fazer o cliente regressar de estado.

## 9. Fluxo de criação e entrada

### Criar sessão

```text
usuário autorizado
  ↓
valida Band + Setlist + MD
  ↓
create BandStageSession
  ↓
create initial BandStageState
  ↓
abre canal Realtime
```

### Entrar como músico

```text
músico autorizado
  ↓
valida membership
  ↓
carrega sessão
  ↓
carrega snapshot corrente
  ↓
assina Broadcast
  ↓
passa a projetar o estado local
```

A assinatura Realtime não substitui autorização. Estar inscrito no canal não significa estar autorizado a comandar a sessão.

## 10. Reconexão

Realtime Broadcast é transporte, não armazenamento durável do estado operacional.

Ao reconectar:

1. o cliente deve considerar seu estado local potencialmente obsoleto;
2. deve obter um snapshot corrente da sessão;
3. deve atualizar sua revisão local;
4. só depois deve voltar a aplicar eventos incrementais.

Não usar a fila local genérica (`BandSyncQueue`) como mecanismo de autoridade para comandos de palco.

## 11. Persistência local

Dexie/IndexedDB pode manter cache local para continuidade de leitura, mas:

- cache não autoriza comandos;
- estado local não supera o servidor/sessão;
- reabertura do app exige reconciliação;
- uma sessão encerrada não deve voltar a `live` por efeito de cache.

## 12. Offline

A primeira versão do Modo Banda deve tratar comandos operacionais offline de forma conservadora.

Regra padrão:

> Sem confirmação de conexão com a sessão, o dispositivo não deve assumir que uma ação operacional foi aplicada globalmente.

O músico pode continuar visualizando o último estado conhecido, marcado como potencialmente desatualizado.

O MD também não deve apresentar uma ação como globalmente confirmada sem confirmação da camada responsável por persistir/publicar o novo estado.

## 13. Segurança

A segurança deve existir em duas camadas:

### Banco/RPC

Operações que alteram a sessão ou seu estado persistido devem passar pelas políticas/RPCs apropriadas.

### Realtime

O canal não deve ser considerado uma superfície confiável para mutação.

O consumidor deve validar:

- `sessionId` esperado;
- membership na banda;
- sessão ainda ativa;
- `mdUserId`/ator autorizado para comandos de controle;
- revisão válida;
- formato do payload.

Nunca confiar apenas em `actorUserId` enviado pelo cliente sem validar sua identidade na sessão/autenticação disponível.

## 14. Ações permitidas

### MD

Na primeira versão:

- iniciar sessão;
- avançar música;
- voltar música;
- ir para índice específico;
- play/pause do fluxo operacional;
- alterar tom operacional compartilhado;
- encerrar sessão.

### Músicos

Na primeira versão:

- entrar/sair da sessão;
- receber estado;
- solicitar snapshot/reconciliação;
- manter preferências individuais fora do estado compartilhado;
- visualizar presença/conectividade quando suportado.

Comandos de músico para alterar o palco não fazem parte do contrato inicial.

## 15. O que NÃO faz parte deste contrato

Não incluir nesta etapa:

- edição colaborativa de letras;
- edição colaborativa do setlist durante `live`;
- eleição automática de MD;
- múltiplos MDs simultâneos;
- CRDT para estado de palco;
- sincronização de cada preferência pessoal para todos;
- garantia de transporte offline de comandos como se fossem confirmados;
- transformação do `BandSyncEngine` em autoridade de palco.

## 16. Relação com o BandSyncEngine

O `BandSyncEngine` existente continua atendendo sincronização de dados da banda.

O Modo Banda cria um protocolo especializado de tempo real para estado operacional.

Portanto:

```text
BandSyncEngine
  = sincronização/persistência de dados de domínio

BandStageSession + BandStageState + Realtime Broadcast
  = sincronização operacional de palco
```

Não combinar os dois modelos sob uma fila única de comandos sem uma decisão arquitetural posterior explícita.

## 17. Máquina de estados da sessão

```text
          create
             ↓
          [lobby]
             │ start
             ▼
           [live]
          /      \
       end        invalid/failure
        ↓              ↓
     [ended]       [ended]
```

Transições válidas na V1:

```text
lobby → live
live → ended
```

Não existe:

```text
ended → live
```

## 18. Critérios de aceitação arquiteturais

A Tarefa J será considerada atendida quando a implementação futura demonstrar:

1. Um setlist consegue originar uma sessão compartilhada.
2. A sessão possui um único MD operacional.
3. O MD consegue alterar o estado de palco.
4. Músicos recebem as alterações sem editar a mesma fonte concorrente.
5. Revisões previnem regressão por eventos atrasados.
6. Reconexão recupera um snapshot correto.
7. Um usuário não-MD não consegue emitir comando de palco aceito.
8. O encerramento impede novas mutações operacionais.
9. Preferências individuais não substituem o estado compartilhado.
10. O protocolo não depende de `BandSyncQueue` como autoridade de palco.

## 19. Próxima implementação

A próxima tarefa de engenharia deve separar o contrato em quatro incrementos:

```text
1. Schema + RLS/RPC
2. domínio + serviço BandStageSession
3. Realtime Broadcast + reconciliação
4. UI do MD + UI dos músicos
```

A implementação só deve avançar para UI depois que os invariantes de autorização, revisão e reconexão estiverem cobertos por testes.
