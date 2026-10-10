# ADR-060 — Hospedagem: Oracle Cloud Always Free (São Paulo)

- **Status:** Proposed
- **Data:** 2026-10-10
- **Decisor:** Jota (owner) — decisão de 2026-10-10, a formalizar no aceite
- **Escopo:** Infraestrutura / operação do backend próprio
- **Bloco:** B1 (fecha o item 9 do ADR-059) · NFR-008, NFR-009
- **Relacionados:** ADR-049, ADR-050, ADR-058, ADR-059 · Roteiro: `docs/OPERATIONS.md` (a criar pelo backend no mesmo PR)

## Contexto

O ADR-059 §9 adiou a hospedagem com três requisitos: região Brasil (LGPD), front e API no mesmo site (cookie de sessão `SameSite=Lax`, §5) e backup com restore testado (NFR-009). O projeto ainda não tem usuário real nem domínio próprio, e o custo deve ser zero até o B8.

## Decisão

1. **Provedor:** Oracle Cloud **Always Free**, região **São Paulo** (`sa-saopaulo-1`), uma VM ARM (Ampere A1).
2. **Pilha:** Docker Compose com três serviços: PostgreSQL 16, `server/` e Caddy.
3. **Mesma origem:** o Caddy serve o build do front (`dist/`) e faz proxy de `/auth`, `/rpc`, `/sync` e `/realtime` (WebSocket) para o `server/`. Front e API ficam na mesma origem: o cookie `SameSite` funciona sem configuração extra e sem domínio próprio. O PostgreSQL não é exposto para fora da rede do Compose.
4. **Endereço e HTTPS:** subdomínio gratuito `*.duckdns.org`, com certificado automático do Caddy (Let's Encrypt). A troca por domínio próprio muda só o `Caddyfile` e `APP_ORIGIN`.
5. **E-mail transacional** (verificação e reset de senha): API HTTP do **Brevo**, com remetente verificado e sem domínio próprio, até existir domínio (aí entram SPF/DKIM). Chave só em variável de ambiente da VM, nunca no repositório (ADR-050).
6. **Backup (NFR-009):** `pg_dump` diário, com cópia fora da VM no **Object Storage do Oracle** (API compatível com S3). Retenção e teste de restore periódico seguem o roteiro em `docs/OPERATIONS.md`. Um backup só vale depois de um restore testado.
7. **Observabilidade (NFR-008):** logs estruturados do `server/` (já sem cookie, token nem conteúdo privado, `REALTIME_CONTRACT.md` §6.4) e do Caddy, lidos pelo `docker compose logs`. Health check simples. Sem serviço externo de APM nesta fase.
8. **Quem opera:** a produção é exclusiva do owner (ADR-050/058). A IA prepara `deploy/` e `docs/OPERATIONS.md` (provisionar, publicar, atualizar, migrar, fazer backup e restaurar), mas não executa nada na VM nem no banco de produção.
9. **Portabilidade:** nada específico do Oracle no código. O Compose roda igual em qualquer VPS Linux, e as migrations seguem o ADR-049.

## Gatilho para sair do Always Free

Migrar para uma VPS paga (mesmo Compose, de preferência no Brasil) quando ocorrer o **primeiro** destes eventos:
- entrada do primeiro usuário real, junto com o B8 (privacidade e LGPD);
- recolhimento ou indisponibilidade recorrente da VM gratuita;
- limite de recurso atingido.

## Alternativas rejeitadas

- **Render + Neon (planos gratuitos):** o serviço dorme após 15 min sem tráfego, o que é inaceitável para o WebSocket do Modo Palco e para a primeira carga. Também roda fora do Brasil (LGPD) e separa front e API em origens diferentes.
- **VPS paga já:** resolve capacidade e recolhimento, mas tem custo antes de haver usuário real. Fica como destino do gatilho acima.
- **AWS (free tier, EC2/RDS):** gratuito só por 12 meses, com cobrança fácil de disparar por engano e mais peças (RDS, ALB) para o mesmo resultado. Não traz vantagem sobre uma VM com Compose.

## Riscos

| Risco | Mitigação |
|---|---|
| O Oracle recolhe instâncias Always Free consideradas ociosas | Monitorar o aviso por e-mail da conta. Backup fora da VM permite recriar a instância. Esse risco aciona o gatilho de migração. |
| Falta de capacidade ARM em São Paulo na criação da VM | Tentar de novo ou usar um formato menor. Plano B: VPS paga no Brasil com o mesmo Compose. |
| Operação manual (atualizações, certificados, backup) | Roteiro passo a passo em `docs/OPERATIONS.md`. Caddy renova o certificado sozinho. O backup é agendado e o restore é testado. |
| DuckDNS e o remetente do Brevo são serviços de terceiros gratuitos | Troca isolada (DNS e `APP_ORIGIN`, ou só o adaptador do mailer). Domínio próprio quando houver usuário real. |
| VM única: sem redundância (aceito no ADR-059 §6) | Backup com restore testado. RTO manual documentado no roteiro. |
| Dados pessoais (e-mail, nome) em infraestrutura de terceiro | Região São Paulo. Revisão de LGPD no B8, antes do primeiro usuário real. |

## Consequências

- O item 9 do ADR-059 fica resolvido para a fase sem usuários reais.
- O backend entrega `deploy/` (Compose, `Caddyfile`, script de backup) e `docs/OPERATIONS.md` no mesmo PR.
- O e-mail transacional passa a depender da API do Brevo.
- A troca por domínio próprio ou VPS paga não muda código: muda configuração.
