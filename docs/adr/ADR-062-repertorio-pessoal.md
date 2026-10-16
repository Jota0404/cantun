# ADR-062 — Repertório pessoal e importação para a organização

- **Status:** Accepted (2026-10-15, decisões D1, D2, P1 e P2 do Jota, dadas diretamente no chat do lead e repassadas ao planner)
- **Data:** 2026-10-15
- **Decisor:** Jota (owner)
- **Escopo:** Repertório / propriedade / permissões / sync
- **Revisa:** [ADR-022](ADR-022-repertoire-is-organization-owned.md) (Repertoire pertence à Organization) e, no ponto do vínculo música-organização, o [ADR-021](ADR-021-organization-song-ownership.md)
- **Relacionados:** ADR-021, ADR-026, ADR-048, ADR-051, ADR-057 · Spec: [`docs/specs/FIX-01-jornada-musical.md`](../specs/FIX-01-jornada-musical.md)

## Contexto

O ADR-022 faz do `Repertoire` uma coleção da `Organization`. Na prática, a pessoa monta seus repertórios na biblioteca dela, no celular, antes (ou sem) ter uma organização, e só depois quer levá-los para a equipe. Hoje a aba Repertórios exige organização e a jornada musical fica bloqueada para quem ainda não tem uma. A biblioteca de músicas já é do usuário (`songs.user_id`, B2 alternativa A); o repertório deve poder seguir o mesmo modelo.

## Decisão

1. **Dois tipos de repertório:**
   - **Pessoal:** dono = o usuário (`created_by_user_id`), **sem organização** (`organization_id` nulo). Só o dono vê e edita; sincroniza em todos os aparelhos dele; funciona offline; usa **qualquer música da biblioteca dele** (`songs.user_id` = dono).
   - **Da organização:** como no ADR-022 (owned pela Organization, permissões do ADR-051).
2. **A aba Repertórios (menu principal) cria repertório pessoal por padrão.** Criar repertório da organização continua possível, a partir da organização.
3. **Importar repertório pessoal** (dentro da organização): Owner, Admin e Líder ativo de alguma equipe da organização (L\*) listam os repertórios pessoais **deles**, cada um com um subtítulo que resume alguns nomes de músicas. Ao escolher, o sistema **copia** (não move) para a organização: cria um repertório da organização com os mesmos itens, na mesma ordem, **apontando para cópias das músicas pertencentes à organização** (ponto 4). As duas cópias do repertório **evoluem separadas**.
4. **Música da organização é uma cópia, não um vínculo** (P2, Jota 2026-10-15). Importar um repertório pessoal, ou adicionar uma música pessoal a repertório ou serviço da organização, cria uma **música nova que pertence à organização** (`Song` com `organization_id`), copiada da pessoal. A edição na organização mexe **só na cópia**; a música pessoal não muda. Apagar a organização **apaga as cópias dela** sem afetar as bibliotecas pessoais. Não é *Arrangement*: é uma `Song` nova da organização (conceito reservado, sem ADR). O repertório pessoal só aceita músicas da **biblioteca do dono** (P1).
5. **Representação no banco:** `songs.organization_id` (nulo = música pessoal; `on delete cascade` da organização), `songs.user_id` continua sendo o **autor** (quem copiou), e `songs.source_song_id` (sem FK) registra a origem. `unique (organization_id, source_song_id) where … and deleted_at is null` torna a cópia **idempotente**: copiar de novo a mesma música reaproveita a cópia existente. Repertório ou serviço da organização só aceita músicas da própria organização; repertório pessoal só aceita músicas pessoais do dono (trigger).
6. **`organization_songs` deixa de ser o vínculo.** Os vínculos existentes são só dados de teste (ADR-059 §1) e, por decisão do Jota (2026-10-16), são **limpos** em vez de convertidos: a migration apaga os itens de repertório e de serviço que apontavam para músicas, zera as referências do Palco, remove as políticas e funções que dependiam de `organization_songs` e, por fim, a tabela. A salvaguarda do B2 "uma música, uma organização" deixa de existir, porque a cópia é de uma só organização.
7. **Permissões** (ver `PERMISSIONS.md` §3.3): repertório pessoal não passa por `app.has_permission`; vale `created_by_user_id = app.current_user_id()` e `organization_id is null`. A importação (`import_personal_repertoire`) e a cópia avulsa de música (`copy_song_to_organization`) são RPCs `security definer` novas; a primeira exige `repertoire.import_personal` (Owner, Admin e Líder ativo L\*), e a segunda, `song.create` na organização.
8. **Consistência (ADR-057):** o repertório pessoal e seus itens são **classe A** (LWW offline, fila, push + pull). A importação e a cópia de música para a organização são **classe B** (RPC só online): sem rede mostra "Sem conexão: tente de novo quando estiver online."
9. **Itens:** sem música repetida no mesmo repertório (`unique (repertoire_id, song_id)` já existe); a ordem é gravada em lote e a `unique (repertoire_id, position)` passa a `deferrable initially deferred` (mesmo padrão do ADR-052).

## Alternativas consideradas

- **Mover em vez de copiar:** tiraria o repertório da pessoa ao importar e criaria dependência entre aparelhos e organização; o Jota escolheu copiar.
- **Repertório pessoal como "organização pessoal" oculta:** reaproveita as políticas, mas mistura papéis e quebra "uma organização principal por conta" (B2 RN-11); rejeitada.
- **Compartilhar o mesmo repertório entre pessoal e organização (referência):** edições em um lado alterariam o outro; rejeitada (cópias separadas).
- **Vincular a música pessoal à organização (`organization_songs`, B2 alternativa A):** a edição da organização alteraria a música pessoal e apagar a organização ou o dono deixaria a música em estado ambíguo; rejeitada em favor da cópia (P2).
- **Importação por qualquer membro:** abre a biblioteca da organização a quem não gere a equipe; o Jota limitou a Líder, Admin e Owner.

## Consequências

- `repertoires.organization_id` passa a **aceitar nulo** (com `check` de que pessoal ⇒ `created_by_user_id` presente) e as políticas de `repertoires` e `repertoire_items` ganham o ramo "pessoal do dono". Migration nova em `db/migrations/` (próximo número livre).
- Dexie: `songs` ganha o índice `organizationId` (v16, Fatia A) e `repertoires` o índice `createdByUserId` (v17, Fatia C); o domínio `Repertoire.organizationId` fica opcional.
- `songs` ganha `organization_id` (cascade) e `source_song_id`; o domínio `Song` ganha `organizationId?` e `sourceSongId?`; o índice `organizationId` entra no Dexie.
- O pull de repertórios traz também os pessoais do usuário e o de músicas traz as cópias das organizações do usuário; a troca de usuário limpa o cache (ADR-048).
- **Risco para o B8:** `songs.user_id` tem `on delete cascade`; apagar a conta do autor apagaria as cópias da organização. A política de saída do B8 deve reatribuir a autoria antes (ver FIX-01).
- O Blueprint (§8.5 e §48.1) e o ADR-022 recebem nota; `PERMISSIONS.md` ganha `repertoire.import_personal`.
- Fora do escopo: repertório inteiro dentro do serviço (B6) e compartilhamento entre usuários.
