# Feature Spec — <nome da feature>

> Modelo do Blueprint §34.1. Copie para `docs/specs/<id>-<slug>.md` (ex.: `VS-01-equipe.md`). Remova as instruções entre `<…>`.

- **Status:** Rascunho | Em revisão | Aprovada | Implementada
- **Bloco:** <B0…B10, ver `docs/blocks/`>
- **Fatia vertical:** <VS-0x, se houver>
- **Autor / data:** <…>

## Feature
<Nome e descrição em uma ou duas frases.>

## Objetivo
<Que problema resolve e para quem. Qual critério de sucesso do Blueprint (§26) sustenta.>

## User Stories
- Como <papel>, quero <ação> para <resultado>.

## Regras de negócio
- <Regra verificável. Citar o ADR ou a seção do Blueprint quando existir.>

## Acceptance Criteria
- [ ] <Critério observável e testável.>

## Requisitos
| ID | Descrição | Origem |
|---|---|---|
| RF-… | <…> | Blueprint §… |
| NFR-… | <…> | Blueprint §… |

## Impacto em domínio, arquitetura e dados

### Domínio
<Entidades, invariantes, máquinas de estado. Respeita as regras de `AI_CONTEXT.md` §6?>

### Arquitetura
<Camadas afetadas, ADRs envolvidos, ADR novo necessário?>

### Dados
- **SQL (Supabase/PostgreSQL):** <migrations aditivas, RPCs; usar `app.current_user_id()`, ADR-049>
- **Dexie:** <nova `version(N+1)`, `upgrade()`, teste de upgrade>
- **Sync:** <filas, estratégia de consistência por entidade>
- **RLS / permissões:** <políticas por papel; a UI não é mecanismo de segurança>

## Fora do escopo
- <O que explicitamente não entra.>

## Plano de testes
- **Domínio / application:** <…>
- **Repositórios (fake-indexeddb):** <…>
- **UI (papel/label acessível):** <…>
- **RLS / SQL (harness):** <…>
- **Manual:** <mobile/tablet, offline>

## Riscos
| Risco | Mitigação |
|---|---|
| <…> | <…> |

## Issues
- [ ] #<n> — <título>
