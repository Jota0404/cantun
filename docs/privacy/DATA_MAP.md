# Mapa de dados, retenção e subprocessadores

> Material técnico para o jurídico (VS-07). Não é texto legal: o texto ao titular está em `privacy-policy.md` e `terms.md` (rascunhos). Itens `[JURÍDICO]` aguardam decisão.

## Índice
- `privacy-policy.md`, `terms.md` — textos públicos (rascunho, versão em `README.md`).
- `DATA_MAP.md` (este) — categorias, finalidades, retenção, subprocessadores.
- `../BACKUP_RECOVERY.md` — cópias de segurança e exclusão em dumps.

## 1. Categorias de dados

| Categoria | Dados | Finalidade | Sensível? | Retenção |
|---|---|---|---|---|
| Conta | e-mail, nome de exibição, hash da senha | identificar e autenticar | Não | Até a exclusão da conta (apagado na hora) |
| Sessão | token de sessão (hash), data, aparelho técnico | manter login | Não | Até logout, expiração ou exclusão |
| Tokens de e-mail | hash de token de confirmação/redefinição | verificar e-mail, trocar senha | Não | Expira; apagado na exclusão |
| Vínculos | organização, equipe, papel, funções musicais | controlar acesso e escalar | **Sim, potencial** (filiação a igreja, LGPD art. 11) `[JURÍDICO: base legal]` | Até remoção do vínculo ou exclusão |
| Escala e disponibilidade | atribuições, datas indisponíveis | montar escalas | Não | Apagadas na exclusão (futuras e passadas) |
| Conteúdo musical | músicas, repertórios, serviços | operar o ministério | Não | Pessoal: apagado na exclusão. Do ministério: permanece com a organização, autoria "Ex-membro" (ADR-062/063) |
| Consentimento | documento (`privacy`, `terms` e a declaração de idade `age`), versão, data do aceite | prova do aceite | Não | Apagado na exclusão `[JURÍDICO: manter prova?]` |
| Log administrativo | tipo de ação, data, organização (sem e-mail nem conteúdo) | auditoria do Owner | Não | Titular vira nulo na exclusão; `[JURÍDICO: prazo]` |
| Logs do servidor | método, rota, status, tempo (sem corpo, cookie, token ou link) | operação e segurança | Não | Conforme o Render `[JURÍDICO: prazo]` |
| Cópias de segurança | tudo acima, em dump | recuperação | Herda | 30 dias (proposto) `[JURÍDICO]`; ver BACKUP_RECOVERY §6 |
| Local no aparelho | cópia Dexie do usuário | uso offline | Herda | Apagada na exclusão e no logout (ADR-048) |

Não coletamos: cookies de analytics, publicidade, localização, contatos, dados de pagamento, dados de menores além de e-mail e nome.

## 2. Subprocessadores

| Operador | Papel | Recebe | Não recebe |
|---|---|---|---|
| Render | hospeda o servidor Node.js | todo tráfego do app (requisições em trânsito) e logs de acesso | banco de dados |
| Neon | hospeda o PostgreSQL | todos os dados armazenados (§1) | — |
| Brevo (e-mail transacional) | envia confirmação de conta e redefinição de senha | e-mail do destinatário, nome de exibição, link/token da mensagem | músicas, repertórios, escalas |

`[JURÍDICO]` Confirmar: país de armazenamento de cada operador, transferência internacional (LGPD art. 33) e cláusulas contratuais. A lista só muda com atualização da Política e nova versão de aceite (D7).
