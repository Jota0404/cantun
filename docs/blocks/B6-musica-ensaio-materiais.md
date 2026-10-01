# B6 — Música no serviço, Ensaio e Materiais (VS-04 / VS-05)

> Fase 2 · Esforço: 4–6 semanas · Depende de: B4 · Requisitos: RF-REP-004, RF-SVC-005, RF-REH-001…003, RF-MUS-005 · Blueprint §8.5, §8.7, §8.8, §16.4, §56

## Objetivo
O serviço concentra tudo o que o músico precisa para se preparar (§56): músicas, tons, materiais, ensaio e observações, sem procurar em outra ferramenta.

## Estado atual
- Repertório reutilizável no modelo alvo (ADR-022/035); `ServiceItem.repertoireId?` existe, mas não há caso de uso "aplicar repertório ao serviço".
- Não existem ensaio, materiais nem storage. `Song.notes` é a única observação.
- Readiness existe só como presença efêmera no Stage (TASK_X).

## Decisões a registrar
- **ADR-056 — Materiais e storage:** provedor portável (S3-compatível ou o que o ADR-049 Fase B usar), tipos permitidos (PDF, imagem, áudio, link externo), tamanho máximo, retenção, cache offline (Cache API/IndexedDB) e autorização por organização. **Não usar Supabase Storage sem esse ADR** (D4).
- Links externos (YouTube, Drive) como tipo de material sem upload, para reduzir custo no primeiro corte.

## Escopo

**Entra:**
1. Spec `docs/specs/VS-04-05-preparacao.md` + ADR-056.
2. **Aplicar repertório ao serviço**: gera itens `song` em posição escolhida, preservando o repertório original; **duplicar repertório** no modelo alvo.
3. **Tom por serviço**: o tom de execução da música naquele serviço (`service_items.key`), sem alterar a cifra base (ADR-007).
4. **Rehearsal**: `rehearsals (id, service_id, starts_at, location, notes)` + itens/músicas focadas; aba Ensaio no serviço.
5. **Materials**: `materials (id, organization_id, owner_type: song|service|rehearsal, owner_id, kind: file|link, title, url/storage_key, mime, size)`; upload e listagem; cache offline do que já foi aberto.
6. **Readiness de preparação** (VS-05): o membro marca "preparado" por serviço. Fica persistido, porque é dado operacional e não presença.
7. Visão do músico (§56): qual serviço, horário, função, músicas, tons, materiais, observações e ensaio, em uma tela.

**Não entra:** Arrangement como entidade (D7), integração com catálogos de cifras ou licenças (§31), editor de PDF.

## Entregáveis por PR
`docs/vs-04-05-spec` · `feat/apply-repertoire-to-service` · `feat/service-item-key` · `feat/rehearsals` · `feat/materials-links` · `feat/materials-upload` (após o ADR-056) · `feat/member-preparation-view`.

## Critérios de aceite
- Aplicar um repertório adiciona as músicas na ordem e o repertório continua reutilizável.
- Mudar o tom no serviço não altera a música na biblioteca.
- O membro abre o serviço e encontra tudo do §56 sem sair da tela.
- Material já aberto continua disponível offline quando tecnicamente viável.

## Riscos
Custo e LGPD de arquivos (áudio/vídeo) → começar por links e PDFs pequenos, com limite de tamanho.
