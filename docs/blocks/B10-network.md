# B10 — Network (hipótese condicionada)

> Fase 5 · Depende de: core validado com igrejas reais · Blueprint §10, §15.2, §23, §30.4, §38 · Auditoria de viabilidade §6

## Objetivo
Quando faltar uma função para um serviço, encontrar e conectar um músico externo **para aquela necessidade pontual**. Sem recrutamento, chat, pagamento ou contrato.

## Status
**Não iniciar.** Condições para reabrir (decisão do owner):
1. MVP-Operacional em uso por N organizações (N a definir) numa mesma região.
2. B8 concluído; moderação, denúncia, bloqueio e anti-spam especificados (§30.4).
3. Estratégia de cold start regional definida (§38).

## O que já prepara o terreno (sem custo extra)
- **Vaga aberta (`ServicePosition`, B4)** é a origem natural da `ServiceNeed`.
- **Participação convidada** (auditoria I5): permitir, no futuro, que alguém sem membership participe de um serviço específico. Modelar na spec do B4 como "fora do escopo, compatível".

## Escopo previsto (quando reaberto)
`PublicProfile` opt-in (nome público, funções, localização aproximada, disponibilidade), busca por função + localização + disponibilidade + tipo de atuação, `ServiceNeed`, `NetworkRequest` com **uma** mensagem contextual, aceite/recusa, troca de contato após o aceite, moderação. RF-NET-001…007.

## Restrições permanentes
Sem thread, inbox ou chat; sem pagamento, comissão ou contrato; dados públicos separados e visualmente diferenciados dos privados (§62.10); perfil desativável e removível.
