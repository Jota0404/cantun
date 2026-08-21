# Salmodia — Product Specification

**Documento:** Pedra Angular do Produto  
**Versão:** 0.1  
**Status:** Accepted / Baseline  
**Última atualização:** 2026-08-21

---

## 1. Visão Geral

### 1.1 Nome do projeto

**Salmodia** — nome provisório.

A identidade visual e o nome comercial definitivo ainda não foram fechados.

### 1.2 Propósito

Um aplicativo simples para músicos de igreja organizarem repertórios, armazenarem suas cifras personalizadas e utilizá-las durante a execução, com foco especial em teclado.

O usuário inicial é o pai do desenvolvedor, mas o produto deve ser concebido de forma que possa futuramente ser disponibilizado para outros músicos e eventualmente comercializado.

### 1.3 Problema

Aplicativos tradicionais de cifras atendem bem à consulta de músicas, mas não necessariamente ao fluxo de um músico que precisa manter sua própria versão da música, com tom utilizado, BPM, observações e organização específica de repertório.

O Salmodia deve resolver esse problema por meio de três conceitos principais:

- **Biblioteca:** todas as músicas cadastradas.
- **Repertórios:** conjuntos ordenados de músicas preparados para uma ocasião.
- **Modo Palco:** ambiente otimizado para execução ao vivo.

---

## 2. Princípios do Produto

1. **Simplicidade:** o aplicativo deve ser compreensível sem treinamento.
2. **Velocidade:** o músico deve chegar rapidamente à cifra.
3. **Legibilidade:** o Modo Palco deve priorizar leitura.
4. **Offline-first:** o uso básico não pode depender de internet.
5. **Personalização:** a música deve representar a versão que o músico realmente toca.
6. **Escalabilidade controlada:** o MVP deve ser simples, mas não deve impedir uma evolução futura do produto.

---

## 3. Público e Contexto de Uso

### 3.1 Usuário inicial

Músico de igreja que utiliza principalmente tablet para visualizar cifras durante o louvor.

### 3.2 Plataformas prioritárias

1. Tablet
2. Celular
3. Desktop

Android e iOS são objetivos do produto. O desenvolvimento inicial poderá priorizar Android, mantendo compatibilidade arquitetural com futura utilização em iOS.

---

## 4. MVP v0.1

### 4.1 Biblioteca

- Criar música
- Editar música
- Excluir música
- Pesquisar por nome
- Pesquisar por artista
- Visualizar música
- Marcar/desmarcar favorito
- Armazenar tom original
- Armazenar tom atual
- Armazenar BPM
- Armazenar cifra/letra
- Armazenar observações

### 4.2 Repertórios

- Criar repertório
- Renomear repertório
- Excluir repertório
- Duplicar repertório
- Adicionar músicas
- Remover músicas
- Reordenar músicas
- Iniciar repertório

### 4.3 Modo Palco

- Exibir cifra
- Exibir nome
- Exibir artista
- Exibir tom
- Exibir BPM
- Exibir observações de forma discreta
- Alterar tamanho da fonte
- Rolagem manual
- Auto-scroll
- Slider de velocidade
- Play/pause do auto-scroll
- Música anterior
- Próxima música
- Fullscreen
- Tentar manter a tela ativa quando suportado pela plataforma
- Modo escuro

### 4.4 Transposição

- Alterar tom
- Transpor acordes automaticamente
- Manter letra intacta
- Preservar tom original
- Permitir retorno ao tom original

### 4.5 Offline / PWA

- Persistência local
- Funcionamento sem internet
- Instalação como PWA

### 4.6 Importação

O MVP deve permitir:

- colar uma cifra em texto;
- importar `.txt`;
- revisar os dados antes de salvar.

PDF, DOC/DOCX e importações inteligentes ficam fora do MVP.

---

## 5. Fora do MVP

- Login
- Contas de usuário
- Sincronização em nuvem
- Backend
- Compartilhamento
- Colaboração em tempo real
- Pedal Bluetooth
- MIDI
- Integração direta com teclados
- Importação PDF
- Importação DOC/DOCX
- Reconhecimento automático de cifra
- IA para geração/organização de cifras
- Metrônomo
- Reprodução de áudio
- YouTube
- Tags
- Categorias
- Filtros avançados
- Escalas/equipe
- Recursos sociais

Recursos futuros não devem ser implementados espontaneamente durante o MVP.

---

## 6. Modelo Conceitual

### 6.1 Música

Uma música existe uma única vez na biblioteca e pode participar de vários repertórios.

Campos previstos:

- `id`
- `title`
- `artist`
- `originalKey`
- `currentKey`
- `bpm`
- `lyrics`
- `notes`
- `isFavorite`
- `createdAt`
- `updatedAt`

### 6.2 Repertório

Um repertório contém apenas:

- nome;
- lista ordenada de músicas.

### 6.3 Relação

A relação entre músicas e repertórios é N:N por meio de uma entidade intermediária que guarda a posição da música no repertório.

---

## 7. Fluxos Principais

### 7.1 Consulta

```text
Abrir aplicativo
    ↓
Biblioteca
    ↓
Pesquisar/selecionar música
    ↓
Visualizar/editar
```

### 7.2 Preparação

```text
Biblioteca
    ↓
Criar repertório
    ↓
Adicionar músicas
    ↓
Ordenar
    ↓
Salvar
```

### 7.3 Execução

```text
Repertório
    ↓
Iniciar
    ↓
Modo Palco
    ↓
Música 1
    ↓
Próxima
    ↓
Música 2
    ↓
Próxima
    ↓
Música 3
```

---

## 8. UX e Direção Visual

### Administração

- bonita;
- simples;
- moderna;
- organizada;
- fácil de compreender.

### Modo Palco

- escuro;
- alto contraste;
- texto grande;
- poucos elementos;
- navegação fácil por toque;
- foco absoluto na leitura.

O MVP não terá sistema complexo de temas.

---

## 9. Critérios de Conclusão do MVP

O MVP estará concluído quando o usuário conseguir:

1. criar uma música;
2. adicionar título;
3. adicionar artista;
4. definir tom original;
5. definir tom atual;
6. definir BPM;
7. adicionar cifra/letra;
8. adicionar observações;
9. editar música;
10. excluir música;
11. pesquisar por nome ou artista;
12. marcar/desmarcar favorito;
13. transpor a cifra;
14. criar repertório;
15. adicionar músicas;
16. remover músicas;
17. reordenar músicas;
18. duplicar repertório;
19. iniciar repertório;
20. abrir Modo Palco;
21. visualizar cifra confortavelmente;
22. alterar tamanho da fonte;
23. visualizar BPM e tom;
24. navegar para próxima música;
25. navegar para música anterior;
26. usar rolagem manual;
27. usar auto-scroll;
28. alterar velocidade do auto-scroll;
29. pausar/retomar auto-scroll;
30. utilizar tela cheia;
31. utilizar o aplicativo sem internet;
32. instalar o aplicativo como PWA.

---

## 10. Roadmap Pós-MVP

### V0.2

Possibilidades:

- filtros por BPM;
- tags;
- categorias;
- filtros avançados;
- melhorias de importação;
- PDF;
- DOCX;
- histórico;
- melhorias de palco;
- configurações específicas de teclado.

### V0.3+

Possibilidades:

- sincronização;
- backup;
- contas;
- Supabase;
- compartilhamento;
- repertórios compartilhados;
- múltiplos músicos.

### Futuro

Possibilidades:

- pedal Bluetooth;
- MIDI;
- integração com teclados;
- metrônomo;
- áudio;
- IA;
- importação inteligente;
- recursos para equipes de louvor;
- gestão de escalas;
- sincronização em tempo real.

---

## 11. Regra de Escopo

Qualquer funcionalidade não descrita no MVP deve ser considerada fora do escopo até que uma nova decisão seja registrada.

Uma funcionalidade futura não deve ser adicionada apenas porque é tecnicamente fácil de implementar.

---

## 12. Controle de Mudanças

Alterações de requisitos devem preservar a rastreabilidade.

Toda mudança relevante deve registrar:

- decisão;
- motivo;
- impacto;
- data;
- versão afetada.

Este documento é a referência principal dos requisitos do produto.

---

# 10. Ordem de Implementação do MVP

O desenvolvimento do MVP seguirá uma estratégia de vertical slices, priorizando funcionalidades utilizáveis e minimizando retrabalho.

## Fase 0 — Preparação e documentação

Antes de qualquer código de aplicação, o repositório deverá conter a documentação-base do projeto:

- `README.md`
- `AI_CONTEXT.md`
- `docs/SALMODIA_PRODUCT.md`
- `docs/SALMODIA_ARCHITECTURE.md`
- `docs/adr/`

O primeiro estado versionado do projeto deve representar o contrato inicial de produto, arquitetura e trabalho com IA.

## Fase 1 — Banco local

- tipos de domínio;
- Dexie;
- IndexedDB;
- schema;
- repositories;
- validações;
- testes básicos.

## Fase 2 — Song CRUD

- criar;
- visualizar;
- editar;
- excluir;
- persistir música.

## Fase 3 — Biblioteca

- busca por nome/artista;
- favoritos;
- estados de UI;
- confirmação de exclusão.

## Fase 4 — Transposição

- lógica de transposição;
- testes;
- integração com a música;
- preservação da cifra base.

## Fase 5 — Repertórios

- criar;
- editar;
- excluir;
- duplicar;
- adicionar/remover músicas;
- ordenar.

## Fase 6 — Modo Palco

- leitura;
- tom;
- BPM;
- observações;
- tamanho da fonte;
- navegação;
- fullscreen;
- modo escuro.

## Fase 7 — Auto-scroll

- play/pause;
- slider de velocidade;
- reinício por música;
- integração com navegação.

## Fase 8 — Importação

- colar cifra;
- importar `.txt`;
- revisão antes de salvar.

## Fase 9 — PWA e validação offline

- instalação;
- cache do app shell;
- funcionamento offline;
- testes em dispositivos reais.

## Fase 10 — Refinamento e validação com usuário real

- UX;
- responsividade;
- desempenho;
- acessibilidade;
- testes com o usuário inicial;
- correções finais do MVP.

Uma fase só será considerada concluída quando sua implementação, testes relevantes e uso na interface estiverem validados.

---

# 14. Implementation Roadmap

A ordem oficial de implementação do MVP é:

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

A documentação é o primeiro estado versionado do projeto e deve existir antes do primeiro código de aplicação.

---

# 15. Vertical Slices e GitHub

Vertical Slices representam grandes marcos funcionais. Os detalhes operacionais serão mantidos no GitHub Issues, sem criar uma documentação redundante para cada slice.

Cada slice pode conter várias Issues. A conclusão do slice exige que seu fluxo completo esteja funcionando e validado.

---

# 16. Testes e validação do produto

A qualidade do MVP será validada em quatro níveis:

1. testes unitários;
2. testes de integração;
3. testes E2E;
4. testes manuais em dispositivos reais.

O MVP também deverá passar por uma validação real com o usuário inicial, principalmente em tablet durante o uso típico de louvor.

O aplicativo não será considerado pronto apenas porque o código compila ou os testes automatizados passam.
