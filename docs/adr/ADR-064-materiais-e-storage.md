# ADR-064 — Materiais e storage de arquivos

- **Status:** Proposed
- **Data:** 2026-10-18
- **Decisor:** Jota (owner) — pendente
- **Escopo:** Materiais (links e arquivos) de serviço, ensaio e música
- **Bloco:** B6 (VS-04/05) · RF-MUS-005, RF-REH-002, RF-SVC-005 · Blueprint §16.4, §31
- **Relacionados:** ADR-026, 048, 049, 050, 057, 059, 060, 063 · Spec: [`docs/specs/VS-04-05-preparacao.md`](../specs/VS-04-05-preparacao.md) · Substitui a reserva "ADR-056"

## Contexto

O Blueprint §16.4 pede materiais acessíveis à equipe sem depender de um aparelho, com cache offline quando viável. Não existe storage: o Render Free não tem disco persistente (ADR-060), o Neon não é lugar de blob e o ADR-059/D4 proíbe Supabase Storage sem ADR. Arquivos trazem custo, LGPD (ADR-063) e copyright (§31). O primeiro corte do B6 usa **só links**, que não exigem storage.

## Decisão (proposta)

1. **Fase 1 (B6, sem este storage):** material = link `https` externo (YouTube, Drive). Só metadados no PostgreSQL; sem fetch, embed nem cache do conteúdo. Migration `kind = 'link'`.
2. **Fase 2 (upload), só depois deste ADR `Accepted`, do B8 e da região definida:** armazenamento de objetos **compatível com S3**, atrás de variáveis de ambiente (`S3_ENDPOINT`, `S3_BUCKET`, chaves), sem recurso exclusivo de provedor (ADR-049). Candidatos: Cloudflare R2 ou Backblaze B2 (camada gratuita, API S3). Região Brasil não é garantida pelos dois; vale o mesmo gatilho do ADR-060 §8 (decidir junto do B8). **Provedor: decisão do Jota.**
3. **Acesso via servidor, autorização no banco:** o cliente nunca recebe credencial do bucket. `server/` chama funções SQL (`can_read_material(id)`, `register_material_upload(...)`) e devolve **URL pré-assinada curta** (GET 5 min, PUT 5 min). Bucket privado. Chave do objeto = `org/<organization_id>/<material_id>`, nunca o nome do arquivo do usuário.
4. **Tipos e tamanho (propostos):** PDF e imagem (PNG/JPEG) até **10 MB**; áudio (MP3/M4A) até **20 MB**; **vídeo nunca** (usar link). Validar extensão, `content-type` e assinatura (magic bytes) no servidor; recusar executáveis e HTML. Cota proposta: **200 MB por organização**.
5. **Fluxo de upload:** RPC cria o material `pending`; cliente envia por PUT pré-assinado; confirmação marca `ready` depois de checar tamanho e tipo no objeto. `pending` sem confirmação em 1 h é limpo.
6. **Retenção:** o arquivo vive com o dono (serviço, ensaio ou música): excluir o dono ou o material remove o objeto (limpeza assíncrona e idempotente); excluir a organização remove todos. Exclusão de conta (ADR-063) **não** remove arquivos da organização; a autoria é anonimizada.
7. **Cache offline:** Cache API/IndexedDB do navegador, chave por `material_id` (não pela URL pré-assinada), só do que o usuário **já abriu**, teto de 50 MB com descarte do menos recente. Limpo na troca de usuário e no logout (ADR-048). Material não aberto antes não toca offline; a tela diz isso.
8. **Backup:** os objetos não estão no backup do Neon (ADR-060 §6); `docs/OPERATIONS.md` ganha a rotina de cópia do bucket e o restore testado antes de aceitar upload.
9. **Copyright e privacidade (§31):** termo de uso na tela de upload (o usuário declara ter direito); remoção a pedido; nenhum material é indexado nem público.
10. **Dependência:** `server/` precisará de um cliente S3 (ex.: `@aws-sdk/client-s3` + presigner); justificar no PR da slice de upload (CLAUDE.md).

## Alternativas consideradas

- **Supabase Storage:** vetado (ADR-059, D4).
- **Arquivos no disco do Render:** sem disco persistente (ADR-060); perde tudo ao reiniciar.
- **Bytes no PostgreSQL (bytea/large objects):** estoura o plano Free do Neon e o backup; rejeitado.
- **Só links para sempre:** custo zero, mas o material depende de terceiro e não toca offline; é a Fase 1, não o destino.
- **Upload pelo `server/` (proxy):** esgota banda e memória do Render Free; pré-assinado é mais barato.

## Consequências

- Fase 1 entrega valor sem custo e sem este bucket; Fase 2 depende de B8 e de decisão de provedor.
- Nova superfície de segurança: URLs pré-assinadas, validação de conteúdo e limpeza de objetos órfãos.
- `PERMISSIONS.md`: `material.manage` governa também o upload; leitura exige membro ativo da organização do material.
- Índice de ADRs: adicionar a linha do 064 e remover a reserva do 056 em "Números reservados"; próximo livre passa a ser 065.
