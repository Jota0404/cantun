# ADR-060 — Hospedagem: Render (Free) + Neon (Free)

- **Status:** Proposed
- **Data:** 2026-10-10
- **Decisor:** Jota (owner) — decisão de 2026-10-10, a formalizar no aceite
- **Escopo:** Infraestrutura / operação do backend próprio
- **Bloco:** B1 (fecha o item 9 do ADR-059) · NFR-008, NFR-009
- **Relacionados:** ADR-049, ADR-050, ADR-058, ADR-059 · Roteiro: `docs/OPERATIONS.md`
- **Fontes:** [Render — Free instances](https://render.com/docs/free) · [Neon — Free plan limits](https://neon.com/faqs/free-plan-limits-and-quotas) (consultadas em 2026-10-10)

## Contexto

O ADR-059 §9 adiou a hospedagem com três requisitos: região Brasil (LGPD), front e API no mesmo site (cookie `SameSite=Lax`, §5) e backup com restore testado (NFR-009). Ainda não há usuário real, domínio nem orçamento. A primeira opção (Oracle Cloud Always Free, São Paulo) foi abandonada porque o Oracle recusou o cartão do owner.

## Decisão

1. **Aplicação:** um **web service gratuito do Render** (`*.onrender.com`, HTTPS do Render, sem domínio próprio). O `server/` serve o build do front (`dist/`) e a API (`/auth`, `/rpc`, `/sync`, `/realtime`) na **mesma origem**, então o cookie `SameSite` funciona sem configuração extra.
2. **Banco:** **Neon Free** (PostgreSQL), com conexão **direta**, sem o host `-pooler`: o realtime usa `LISTEN/NOTIFY` (`REALTIME_CONTRACT.md` §6), que não funciona atrás de pooler em modo transação. A connection string fica só nas variáveis de ambiente do Render (ADR-050).
3. **E-mail transacional:** API do **Brevo**, com remetente verificado e sem domínio próprio, até existir domínio.
4. **Sono intencional, sem pinger:** o Render dorme o serviço após 15 min sem tráfego de entrada e acorda na próxima requisição, em cerca de 1 min. Isso é **desejado**: com o serviço parado, o Neon também suspende, e a cota de computação do Free (≈100 CU-horas/mês; confirmar no provisionamento) só é gasta durante o uso.
5. **Modo Palco não dorme durante o uso:** mensagens de WebSocket em conexões abertas contam como tráfego de entrada para o Render. O `ping` do cliente a cada 25 s (`REALTIME_CONTRACT.md` §1) mantém o serviço acordado enquanto houver alguém no palco.
6. **Backup (NFR-009):** histórico de restauração (point-in-time) do Neon dentro da janela do Free, mais `pg_dump` manual documentado em `docs/OPERATIONS.md`, guardado fora do Render. O Render Free não tem disco persistente e perde arquivos locais a cada reinício ou sono. Um backup só vale depois de um restore testado.
7. **Observabilidade (NFR-008):** logs estruturados do `server/` (sem cookie, token nem conteúdo privado, `REALTIME_CONTRACT.md` §6.4) no painel de logs do Render, mais um health check. Sem APM externo.
8. **Região:** fora do Brasil, aceita **só até o primeiro usuário real**.
9. **Quem opera:** a produção é exclusiva do owner (ADR-050/058). A IA prepara a configuração e o roteiro (`docs/OPERATIONS.md`), mas não executa nada no Render nem no Neon.
10. **Portabilidade:** nada específico de provedor no código. O `server/` e as migrations (ADR-049) rodam em qualquer host com Node e PostgreSQL 16.

## Gatilho para migrar

Migrar para hospedagem paga no Brasil (VPS ou gerenciado, com o mesmo `server/`) quando ocorrer o **primeiro** destes eventos:
- entrada do primeiro usuário real, junto com o **B8** (privacidade, LGPD e região Brasil);
- cota do Neon ou horas do Render esgotadas com frequência;
- partida a frio prejudicando o uso real.

## Alternativas rejeitadas

- **Oracle Cloud Always Free (São Paulo):** atendia região e custo, mas o cartão do owner foi recusado no cadastro.
- **Render Postgres Free:** o banco gratuito expira 30 dias após a criação e é apagado depois de uma carência.
- **VPS paga:** sem orçamento antes de haver usuário real. Fica como destino do gatilho.

## Riscos

| Risco | Mitigação |
|---|---|
| Partida a frio de cerca de 1 min no primeiro acesso após o sono | Aceito na fase sem usuários. Abrir o app antes do culto. O Modo Palco em uso não dorme (item 5). |
| Cota de computação do Neon Free esgotada | O sono do Render mantém o Neon parado fora de uso. Acompanhar o consumo no painel. O esgotamento frequente aciona o gatilho. |
| Horas do Render Free esgotadas (750 h por workspace/mês; com cota zerada, o serviço é suspenso até o mês seguinte) | Um serviço só, que dorme fora de uso. |
| Limites do plano Free mudarem sem aviso | Fontes datadas neste ADR. Revisão a cada mudança. Código portável (item 10). |
| Conexão direta do Neon: limite de conexões e reconexão após a suspensão | Pool pequeno no `server/`. O `LISTEN` já reconecta com backoff e faz resync (`REALTIME_CONTRACT.md` §6.2). |
| Dados pessoais (e-mail, nome) fora do Brasil | Só dados de teste até o B8. A migração para região Brasil é pré-requisito do primeiro usuário real. |
| Operação e backup manuais | Roteiro passo a passo em `docs/OPERATIONS.md`, com restore testado. |

## Consequências

- O item 9 do ADR-059 fica resolvido para a fase sem usuários reais.
- `deploy/` e `docs/OPERATIONS.md` passam a descrever o Render e o Neon. O Docker Compose, o Caddy e o DuckDNS do rascunho com o Oracle saem.
- O `server/` precisa servir os arquivos estáticos do front e ler a connection string direta do Neon.
- A troca de provedor muda configuração, não código.
