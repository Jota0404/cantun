# B8 — Privacidade mínima (LGPD) e recuperação

> Fase 0/1 · Esforço: 1–2 semanas · Depende de: B2 · **Obrigatório antes de qualquer igreja real usar** · Blueprint §15, §30, §50, NFR-005, NFR-006, NFR-009 · Auditoria de viabilidade: B1, B2

## Objetivo
Permitir uso real com base legal, transparência e recuperação de dados, considerando que **filiação a igreja já é dado pessoal sensível no core** (LGPD art. 5º II e art. 11) e que há adolescentes nas equipes (art. 14).

## Estado atual
- Sem política de privacidade, termos, exclusão de conta nem regra para menores.
- Isolamento local por usuário resolvido (ADR-048, PR #39).
- Sem estratégia de backup; o app já está publicado no GitHub Pages contra o Supabase real.

## Escopo

**Entra:**
1. `docs/privacy/` com: finalidades, bases legais, categorias de dados (incluindo dados sensíveis), retenção, subprocessadores (Supabase, provedor de e-mail, hospedagem), direitos do titular e contato do controlador. **Revisão por assessoria jurídica.**
2. Páginas públicas no app: **Política de Privacidade** e **Termos de Uso**; aceite registrado no cadastro (`user_consents`: versão, data).
3. **Exclusão de conta**: RPC que remove o usuário e os dados pessoais, com decisão sobre o que acontece com o conteúdo da organização (ex.: transferir para o Owner, anonimizar autoria); fluxo na UI com confirmação.
4. **Exportação dos dados do titular** (JSON) — recomendada.
5. **Menores**: regra de produto definida com o jurídico (idade mínima para conta própria e/ou consentimento do responsável) e minimização de dados de membros menores.
6. `docs/BACKUP_RECOVERY.md`: frequência, retenção, onde fica a cópia (independente do provedor), procedimento de **restore testado**, RPO/RTO alvo. Avaliar o plano pago do Supabase (backup diário) até o B9.
7. Logs administrativos para ações críticas (remoção de membro, mudança de papel, exclusão de conta) sem conteúdo privado (NFR-008).

**Não entra:** perfil público da Network e moderação (B10).

## Critérios de aceite
- Cadastro exige aceite da versão vigente da política e dos termos.
- O usuário exclui a própria conta pela UI e os dados pessoais deixam de existir (verificado em teste).
- Existe um restore documentado e executado ao menos uma vez em ambiente de teste.
- A regra para menores está implementada conforme decisão jurídica registrada.

## Riscos
Interpretação jurídica → este bloco produz o material técnico; a decisão legal é do owner com assessoria.
