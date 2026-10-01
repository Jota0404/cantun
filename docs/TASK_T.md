# CANTUM — Tarefa T: Anotações do MD no Modo Banda

## Objetivo

Permitir que o MD publique uma anotação operacional compartilhada durante uma sessão ao vivo do Modo Banda. A anotação pertence ao estado da sessão, é limitada a 500 caracteres e pode ser limpa ou atualizada.

## Fluxo

```text
MD
 ↓
BandStageService.setAnnotation()
 ↓
band_stage_set_annotation()
 ↓
BandStageState.mdAnnotation + revision
 ↓
stage.annotation-updated
 ↓
Realtime / reconciliação
 ↓
Músicos conectados
```

## Autoridade

A escrita continua protegida por RPC. `private.require_band_stage_md()` deriva o usuário de `auth.uid()` e garante que apenas o MD operacional da sessão altere a anotação. Músicos continuam somente leitura.

## Persistência e sincronização

`band_stage_states.md_annotation` armazena a anotação atual. Toda alteração incrementa a `revision`, reutilizando a mesma ordenação/reconciliação já usada pelos comandos de palco. O evento `stage.annotation-updated` transporta a nova anotação e o estado autoritativo.

Não há estado paralelo no Realtime: em caso de perda de evento ou reconnect, o snapshot existente recupera a anotação persistida.

## UI

O MD recebe um editor com contador de caracteres, publicação, atualização e limpeza. O músico vê a anotação em destaque quando presente e não recebe qualquer controle operacional adicional.

## Fora do escopo

- histórico de anotações;
- anotações privadas por músico;
- novas permissões de banda;
- alteração do repertório;
- criação de um canal Realtime separado.
