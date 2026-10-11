# ADR-057 — Política de consistência por entidade

- **Status:** Accepted (owner, 2026-10-11)
- **Data:** 2026-10-11
- **Decisor:** Jota (owner)
- **Escopo:** Sync / escrita offline / autoridade do servidor
- **Bloco:** B4 (VS-03), generaliza o que o B2 e o B3 já adotaram
- **Relacionados:** ADR-026 (refinado, não substituído), ADR-042, ADR-051, ADR-052, ADR-053, ADR-059

## Contexto

O ADR-026 define sync local-first com LWW por `updatedAt` para as entidades do domínio. Na prática, o B2 (papel, status e funções de outros) e o B3 (status do serviço) já saíram desse molde: o servidor é a autoridade, a mudança é só online por RPC e o pull sobrescreve o local. O B4 acrescenta a confirmação da escala. É preciso uma regra única para decidir, a cada entidade nova, onde ela fica.

## Decisão

Toda entidade pertence a **uma** classe:

| Classe | Regra | Entidades |
|---|---|---|
| **A — LWW offline** | Escrita local, fila, push + pull, `updatedAt` decide (ADR-026). Autorização no servidor ao subir; rejeição reverte e avisa. | músicas, repertórios e itens, informações do serviço, itens da ordem do serviço, vagas (`service_positions`), disponibilidade do próprio membro, organização e nome de equipe |
| **B — Autoridade do servidor, só online** | Mudança só por RPC `security definer`; **sem fila offline**. Sem rede: "Sem conexão: tente de novo quando estiver online." e nada muda localmente. O estado local muda só com a resposta da RPC ou com o pull, que é autoritativo (sem comparar `updatedAt`). Sem push dessas colunas. | papel, status e funções de membros; `services.status`; **todas as transições de `assignments`**; convites; papel de organização |
| **C — Efêmero ou derivado do servidor** | Não persistido como dado operacional ou lido do servidor a cada uso (ADR-042 para o Stage). | presença e readiness; estado do Stage (snapshot); perfis (`display_name`); lacunas e estado da vaga (derivados) |

Regras:
1. Entidade nova declara a classe na sua spec; sem declaração, é classe A somente se a rejeição ao subir for inofensiva.
2. A classe B existe quando a ação depende de **quem pode** e de **estado atual** (transições, responsabilidade pessoal). Nelas, resolver o conflito offline com LWW seria inseguro ou enganoso.
3. A classe A continua sem exceção de autorização: a RLS decide no servidor.
4. Colunas de classe B ficam fora do `grant` de escrita de `cantum_user` (trigger de guarda ou revoke), como em `team_memberships` e `services.status`.

## Alternativas consideradas

- **Confirmar offline com autoridade do titular** (rascunho do bloco B4): permite responder sem rede, mas exige fila de comandos, resolução contra mudanças do Líder e UX de reversão. Rejeitada por ora (decisão do lead): o padrão do B2/B3 é só online.
- **LWW para tudo:** transições inválidas sobem por sync; rejeitada (já descartada no ADR-052).
- **CRDT / fila de comandos para a classe B:** complexidade sem demanda; adiada.

## Consequências

- O músico sem sinal não confirma até voltar a rede (mitigação: a atribuição fica `invited` e o Líder vê "aguardando"). Reavaliar se o uso real mostrar dor.
- O ADR-026 permanece `Accepted`: este ADR só delimita a classe A e registra as exceções já praticadas.
- Testes de cada entidade seguem a classe: A com fila e rejeição; B sem fila, sem push, pull autoritativo.
