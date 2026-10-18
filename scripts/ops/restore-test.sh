#!/usr/bin/env bash
# CANTUM — restaura uma cópia num banco LOCAL de teste e confere. Docs: docs/BACKUP_RECOVERY.md.
# Uso: scripts/ops/restore-test.sh <arquivo.dump> <nome_do_banco_novo>
# Só conecta no PostgreSQL local (PG* padrão). Recusa rodar com DATABASE_URL definida
# (para nunca apontar para o Neon por engano). O banco novo não pode existir.
set -euo pipefail
FILE="${1:?uso: restore-test.sh <arquivo.dump> <nome_do_banco_novo>}"
DB="${2:?informe o nome do banco novo (ex.: cantum_restore)}"
[ -z "${DATABASE_URL:-}" ] || { echo "Recusado: DATABASE_URL está definida. Rode 'unset DATABASE_URL'." >&2; exit 1; }
[[ "$DB" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "Nome de banco inválido." >&2; exit 1; }
[ -f "$FILE" ] || { echo "Arquivo não encontrado: $FILE" >&2; exit 1; }
[ -z "${PGHOST:-}" ] || [[ "$PGHOST" == localhost || "$PGHOST" == 127.0.0.1 || "$PGHOST" == /* ]] \
  || { echo "Recusado: PGHOST não é local." >&2; exit 1; }

createdb "$DB"
# 'cantum_user' e roles do Neon podem não existir localmente; --no-owner/--no-privileges evitam erro.
pg_restore --no-owner --no-privileges --dbname "$DB" "$FILE"

echo "== Migrations aplicadas (última) =="
psql -X -d "$DB" -tA -c "select max(version) || ' (' || count(*) || ' no total)' from app.schema_migrations"
echo "== Linhas por tabela =="
psql -X -d "$DB" -tA -F ' : ' -c "
  select table_schema || '.' || table_name,
         (xpath('/row/c/text()', query_to_xml(format('select count(*) c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
  from information_schema.tables
  where table_schema in ('app','public') and table_type = 'BASE TABLE' order by 1"
echo "Restore concluído em '$DB'. Compare 'app.users' com o número de contas do app."
