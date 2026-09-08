# CI/CD — CANTUM

## Visão geral

O CANTUM separa validação de código de publicação no GitHub Pages.

- `.github/workflows/ci.yml`: executa a validação automática do projeto.
- `.github/workflows/deploy-pages.yml`: publica exclusivamente no GitHub Pages.

## CI

O workflow de CI é disparado em:

- qualquer Pull Request;
- qualquer push para qualquer branch (`**`).

A sequência executada é:

```bash
npm install --no-audit --no-fund
npm test
npm run lint
npm run build
```

Cada comando é uma etapa obrigatória. Falhas em testes, lint ou build deixam o workflow como `failure`; não há `|| true`, etapas opcionais ou supressão de erros.

## Configuração atual

O projeto usa Node.js 24 no GitHub Actions, conforme o workflow de Pages que já existia no repositório. O CI mantém essa mesma versão para evitar uma alteração de runtime sem necessidade.

Os scripts vêm do `package.json`:

- `npm test` → `vitest run`;
- `npm run lint` → `eslint .`;
- `npm run build` → `tsc -b && vite build`.

O Vitest está configurado em `vite.config.ts`, com ambiente `node`.

O TypeScript é executado pelo build através de `tsc -b`, usando `tsconfig.json` e suas referências. O ESLint usa `eslint.config.js`.

## Deploy

O workflow de Pages permanece separado do CI.

A publicação automática continua restrita à branch:

```text
feature/song-detail
```

O deploy também pode ser iniciado manualmente com `workflow_dispatch`.

O workflow de Pages não executa mais testes nem lint: sua responsabilidade é somente instalar dependências, gerar `dist`, preparar o fallback SPA e publicar o artefato no GitHub Pages.

## Como interpretar uma falha

Uma falha no workflow `CI` significa que pelo menos uma das validações obrigatórias falhou.

1. Abra a execução do workflow.
2. Entre no job `validate`.
3. Identifique a primeira etapa vermelha (`Run tests`, `Run lint` ou `Build`).
4. Leia o erro produzido pelo comando correspondente.
5. Corrija a causa no código/configuração e envie um novo commit.

Não se deve contornar a falha removendo a etapa, ignorando seu exit code ou alterando o comportamento do produto apenas para obter um CI verde.

Uma falha no workflow `Deploy CANTUM to GitHub Pages` é tratada separadamente: primeiro verifique instalação, build, artefato Pages e configuração de publicação. O deploy só ocorre depois que o job `build` do próprio workflow termina com sucesso.

## Escopo desta configuração

Esta separação é de infraestrutura. Ela não modifica o domínio ou a arquitetura do Modo Banda, nem altera `BandStageState`, `BandStageSession`, `BandStageService`, `BandStageRealtime`, Presence, Readiness, MusicalRole, RPCs ou migrations de produto.
