# CANTUM — Tarefa S: Personalização Efetiva do Modo Banda por Função Musical

A Tarefa S transforma a preferência `MusicalRole` criada na Tarefa R em comportamento observável no Modo Banda.

## Objetivo

Cada músico recebe uma experiência inicial de palco derivada da sua função musical, sem alterar a autoridade do MD nem o estado compartilhado da sessão.

## Comportamentos

- `vocals`: leitura com fonte inicial maior;
- `drums`: inicia em páginas e oculta informações de tom/observações pouco úteis;
- `bass`: leitura com fonte maior e foco no conteúdo musical;
- `brass` / `woodwinds`: mantém foco na cifra e reduz observações secundárias;
- demais funções: experiência equilibrada e compatível com o palco existente.

O músico continua podendo ajustar tamanho da fonte e modo de leitura durante a sessão.

## Arquitetura

```text
BandMember.musicalRole
        ↓
get_my_band_stage_experience()
        ↓
getMyBandStageExperience()
        ↓
BandStagePage / BandMusicianStagePage
```

A RPC de experiência é derivada da mesma associação autenticada de `band_members` usada pela Tarefa R. Existe fallback para `get_my_band_musical_role`, mantendo compatibilidade caso a migração de S ainda não tenha sido aplicada.

Nenhuma permissão operacional nova é criada e o MD continua sendo a autoridade operacional da sessão.

## Fora do escopo

- alterar comandos de palco;
- alterar `BandStageState`;
- criar eventos Realtime novos;
- introduzir preferências globais fora do contexto da função musical;
- remover controles manuais do músico.
