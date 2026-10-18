# docs/privacy

Textos de Política de Privacidade e Termos de Uso, importados como texto pelo cliente (`src/pages/Legal/LegalPage.tsx`).

**Pendência de go-live:** o aceite grava a versão `2026-10-17` para texto em RASCUNHO. Antes de qualquer usuário real, o jurídico finaliza os trechos marcados `[JURÍDICO]` e a versão sobe, no mesmo PR: nova migration com `create or replace function app.current_consent_version()`, `src/domain/privacy/consent.ts` e estes arquivos. O `LegalPage` mostra o aviso de rascunho (`role="note"`) enquanto o texto tiver a linha `> RASCUNHO` no topo; ao finalizar, remova essa linha.
