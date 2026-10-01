# ADR-013 — Contrato do Modo Banda / Sessão de Modo Palco

**Status:** Accepted  
**Data:** 2026-09-07

## 1. Contexto

O CANTUM possui o conceito de banda compartilhada, repertório oficial, membership, sincronização de dados e Modo Palco individual.

A próxima etapa do produto é permitir que uma banda execute um repertório em **Modo Palco compartilhado**, mantendo os dispositivos dos músicos sincronizados durante uma apresentação.

A sincronização necessária para esse cenário não é uma simples replicação de dados da banda. Durante uma apresentação existe um estado operacional efêmero: música atual, posição no repertório e controles de palco. Esse estado deve ser coordenado em tempo real.

A arquitetura adotada é:

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

## 2. Decisão

O Modo Banda utilizará uma **BandStageSession** explicitamente iniciada a partir de um `BandSetlist`.

A sessão possui um único **MD operacional**, definido pela regra de autoridade do Modo Banda. O MD é a autoridade para alterações do estado operacional de palco.

Os músicos participantes são clientes sincronizados e não podem alterar arbitrariamente o estado compartilhado.

A sessão possui estado operacional separado do estado persistente do repertório/banda.

## 3. Responsabilidades das entidades

### Band

Representa a banda e seu relacionamento de membership.

Não contém diretamente o estado operacional da apresentação.

### BandSetlist

Representa o repertório oficial que pode ser usado em uma apresentação.

Alterações estruturais do repertório são dados persistentes e não devem ser confundidas com eventos efêmeros de palco.

### BandStageSession

Representa uma execução compartilhada de um `BandSetlist`.

Responsabilidades mínimas:

- identificar a banda;
- identificar o repertório usado pela sessão;
- identificar o usuário que possui autoridade operacional (MD);
- controlar ciclo de vida (`created`, `active`, `ended`);
- fornecer identidade estável para o canal de Realtime;
- permitir que clientes ingressem na mesma sessão.

Campos conceituais:

```ts
interface BandStageSession {
  id: string
  bandId: string
  setlistId: string
  operationalDirectorId: string
  status: 'created' | 'active' | 'ended'
  createdAt: string
  startedAt?: string
  endedAt?: string
}
```

### BandStageState

Representa exclusivamente o estado operacional compartilhado da sessão.

Campos mínimos:

```ts
interface BandStageState {
  sessionId: string
  revision: number
  currentSongIndex: number
  currentSongId: string
  updatedAt: string
  updatedBy: string
}
```

Controles estritamente locais ao dispositivo, como tamanho da fonte, velocidade de auto-scroll, fullscreen e preferência visual, **não fazem parte do estado compartilhado**.

## 4. Autoridade operacional

A autoridade de palco é única.

```text
BandStageSession
        ↓
Operational Director (MD)
        ↓
BandStageState
```

Somente o usuário identificado em `operationalDirectorId` pode emitir comandos mutáveis de palco.

A UI nunca deve confiar apenas em uma flag local como `isMD`. A autorização deve ser validada no ponto de entrada da operação e refletida pelas políticas/ações protegidas do backend quando a operação for persistida.

A transferência de autoridade operacional encerra a autoridade do MD anterior imediatamente.

## 5. Comandos de palco

Os comandos compartilhados devem ser pequenos, explícitos e determinísticos.

Contrato conceitual:

```ts
type BandStageCommand =
  | {
      type: 'stage.song.set'
      songIndex: number
      songId: string
      commandId: string
      sessionId: string
      issuedBy: string
      issuedAt: string
    }
  | {
      type: 'stage.session.end'
      commandId: string
      sessionId: string
      issuedBy: string
      issuedAt: string
    }
```

Comandos de interface local não devem ser broadcastados.

Exemplos locais:

- `fontSizeChanged`
- `autoScrollEnabled`
- `autoScrollSpeedChanged`
- `fullscreenToggled`

## 6. Eventos de sincronização

O transporte deve ser tratado como entrega de mensagens, não como fonte de verdade definitiva.

O Broadcast envia eventos/comandos como:

```ts
interface BandStageEventEnvelope<T> {
  eventId: string
  sessionId: string
  revision: number
  type: string
  issuedBy: string
  issuedAt: string
  payload: T
}
```

O cliente deve ignorar mensagens destinadas a outra sessão.

`eventId` deve ser único e pode ser usado para deduplicação local.

`revision` deve crescer monotonicamente dentro da sessão.

## 7. Fonte de verdade

A fonte de verdade é distribuída por responsabilidade:

### Dados persistentes

PostgreSQL/Supabase é a fonte remota autoritativa dos dados persistentes da banda, repertórios e sessão.

IndexedDB/Dexie funciona como armazenamento local/cached replica e continua essencial para comportamento local-first.

### Estado operacional em tempo real

O estado compartilhado atual é derivado de `BandStageState` e das mensagens da sessão.

Supabase Realtime Broadcast é o transporte de baixa latência para propagar comandos/eventos.

Broadcast **não** deve ser tratado como banco de dados e não deve ser a única forma de reconstruir o estado após reconexão.

## 8. Bootstrap de um músico

Quando um músico entra em uma sessão:

```text
abrir sessão
   ↓
validar membership
   ↓
validar sessão
   ↓
obter snapshot atual de BandStageState
   ↓
entrar no canal Realtime
   ↓
aplicar eventos futuros
```

A entrada na sessão não deve depender de o cliente ter recebido todos os broadcasts anteriores.

Se o cliente perder a conexão, ele deve ser capaz de recuperar o snapshot atual e continuar recebendo eventos posteriores.

## 9. Consistência e concorrência

O modelo não utilizará edição concorrente do estado de palco por múltiplos usuários.

O MD produz a sequência autorizada de mudanças.

`revision` funciona como marcador de ordem lógica do estado.

Ao receber uma atualização:

```text
revision recebida <= revision local
    → ignorar

revision recebida > revision local
    → aplicar
```

Uma mensagem fora de ordem não deve fazer o cliente retroceder.

## 10. Persistência e fila

Operações de dados persistentes seguem a arquitetura de sincronização existente (`BandSyncQueue` / `BandSyncEngine` / `BandSyncService`).

Não criar uma segunda fila genérica apenas para transportar comandos de palco.

A sessão de palco possui ciclo de vida próprio e não deve usar a fila de sincronização de dados para simular tempo real.

Fluxo preferencial:

```text
MD
 ↓
application command
 ↓
validação de autoridade
 ↓
atualização do BandStageState
 ↓
Broadcast do evento
 ↓
músicos aplicam snapshot/evento
```

## 11. Segurança

Membership da banda é requisito para ingressar na sessão.

Autoridade operacional é requisito para emitir comandos mutáveis.

O frontend não pode receber credenciais privilegiadas.

RLS e/ou funções protegidas no Supabase permanecem responsáveis por garantir que a manipulação persistente da sessão respeite a banda e o usuário autenticado.

Nenhum cliente deve conseguir tornar-se MD simplesmente alterando estado React, IndexedDB ou payload de Broadcast.

## 12. Ciclo de vida

```text
created
   ↓ start
active
   ↓ end
ended
```

Regras:

- somente `active` aceita comandos de navegação compartilhada;
- `ended` é terminal para a execução;
- uma nova apresentação utiliza uma nova `BandStageSession`;
- a sessão não altera o repertório oficial apenas por navegar entre músicas.

## 13. Separação entre repertório e palco

A seguinte distinção é obrigatória:

```text
BandSetlist
= o que será tocado

BandStageState
= onde a apresentação está agora
```

Alterar a música atual não altera a ordem persistida do `BandSetlist`.

Da mesma forma, reordenar o repertório persistente não deve ser usado como mecanismo de navegação durante uma sessão ativa.

## 14. Offline e reconexão

O Modo Banda depende de conectividade para manter participantes sincronizados em tempo real.

Cada dispositivo deve continuar exibindo o último estado válido quando uma desconexão ocorrer, mas não deve fingir que continua sincronizado.

O cliente deve expor estado de conexão da sessão, por exemplo:

```ts
type StageConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
```

Após reconectar:

```text
reconectar
   ↓
obter snapshot atual
   ↓
comparar revision
   ↓
aplicar snapshot mais recente
   ↓
continuar ouvindo Broadcast
```

## 15. Responsabilidade da UI

A UI pode apresentar:

- música atual;
- indicador de sessão ativa;
- nome/status do MD;
- estado de conexão;
- navegação bloqueada para músicos;
- confirmação de atualização de estado.

A UI não decide autoridade.

A UI também não deve manipular diretamente Supabase Realtime ou IndexedDB. Essas responsabilidades ficam nas camadas de aplicação/infraestrutura existentes.

## 16. Testes obrigatórios

### Domínio / aplicação

- MD pode iniciar sessão;
- usuário sem autoridade não pode alterar estado compartilhado;
- avanço de música altera `BandStageState`;
- retorno de música altera `BandStageState`;
- sessão encerrada rejeita comandos de navegação;
- `revision` cresce a cada mudança válida;
- mensagens antigas não sobrescrevem estado mais novo.

### Integração

- criar sessão a partir de `BandSetlist`;
- recuperar snapshot ao entrar;
- publicar comando/evento;
- receber evento em outro cliente;
- reconectar e recuperar estado atual.

### Segurança

- membro não pertencente à banda não entra na sessão;
- músico membro não assume autoridade por alteração do cliente;
- MD anterior perde autoridade após transferência.

## 17. O que NÃO faz parte deste contrato

Fora de escopo nesta etapa:

- sincronização de rolagem pixel a pixel;
- sincronização de posição exata do scroll de cada músico;
- metrônomo compartilhado;
- áudio compartilhado;
- MIDI;
- pedal Bluetooth;
- controle remoto de configurações pessoais do dispositivo;
- edição colaborativa do repertório durante a apresentação.

## 18. Consequências

### Benefícios

- autoridade operacional clara;
- separação entre dado persistente e estado efêmero;
- reconexão determinística;
- baixo acoplamento entre Realtime e domínio;
- aproveitamento da infraestrutura de sincronização já existente;
- possibilidade de evoluir o protocolo sem remodelar `BandSetlist`.

### Custos

- necessidade de nova modelagem de sessão;
- necessidade de controle de revisão;
- necessidade de tratar reconexão explicitamente;
- necessidade de testes multi-cliente.

## 19. Regra final

> **Realtime sincroniza a apresentação; o banco preserva o estado necessário para recuperar a apresentação; o MD controla a apresentação.**
