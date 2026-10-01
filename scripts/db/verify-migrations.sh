#!/usr/bin/env bash
# CANTUM — aplica todas as migrations em um PostgreSQL padrão (ADR-049).
#
# Cria um banco descartável, aplica o shim da plataforma Supabase
# (scripts/db/platform-shim.sql) e, em ordem, cada arquivo de
# supabase/migrations em sua própria transação. Falha se qualquer
# migration não puder ser aplicada.
#
# Variáveis (padrões para o service container do CI):
#   PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres
#   VERIFY_DB=cantum_migrations_check
#   KEEP_GOING=1   continua após falhas e lista todas (padrão: para na primeira)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS_DIR="$ROOT/supabase/migrations"
SHIM="$ROOT/scripts/db/platform-shim.sql"
DB="${VERIFY_DB:-cantum_migrations_check}"
KEEP_GOING="${KEEP_GOING:-0}"

export PGHOST="${PGHOST:-localhost}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" -d postgres -c "drop database if exists \"$DB\"" -c "create database \"$DB\""
"${PSQL[@]}" -d "$DB" -f "$SHIM" 2>&1 | grep -v -E 'wal_level|HINT' || true

total=0
failed=0
for file in "$MIGRATIONS_DIR"/*.sql; do
  total=$((total + 1))
  name="$(basename "$file")"
  if output="$("${PSQL[@]}" -d "$DB" --single-transaction -f "$file" 2>&1)"; then
    echo "ok    $name"
  else
    failed=$((failed + 1))
    echo "FAIL  $name"
    echo "$output" | grep -E 'ERROR|LINE' | sed 's/^/      /' | head -4
    [ "$KEEP_GOING" = "1" ] || break
  fi
done

echo
echo "Migrations aplicadas: $((total - failed))/$total (falhas: $failed)"
[ "$failed" -eq 0 ]
