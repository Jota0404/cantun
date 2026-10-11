#!/usr/bin/env bash
# CANTUM — verifica o schema em um PostgreSQL padrão (ADR-059).
#
# Cria um banco descartável, aplica db/migrations com scripts/db/migrate.sh,
# confere que uma segunda execução não aplica nada e roda os testes SQL de
# db/tests (cada arquivo falha com exceção se uma verificação não passar).
#
# Variáveis (padrões para o service container do CI):
#   PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres
#   VERIFY_DB=cantum_migrations_check
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="${VERIFY_DB:-cantum_migrations_check}"

export PGHOST="${PGHOST:-localhost}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" -d postgres -c "drop database if exists \"$DB\"" -c "create database \"$DB\""

"$ROOT/scripts/db/migrate.sh" "$DB"

second_run="$("$ROOT/scripts/db/migrate.sh" "$DB")"
if [ -n "$second_run" ]; then
  echo "FAIL  a segunda execução do migrate.sh aplicou migrations de novo:"
  echo "$second_run"
  exit 1
fi
echo "ok    migrate.sh é idempotente"

for test in "$ROOT"/db/tests/*.sql; do
  "${PSQL[@]}" -d "$DB" -f "$test"
  echo "ok    $(basename "$test")"
done

# Testes de atualização: db/upgrade/NNNN_pre.sql semeia dados no schema anterior à migration
# NNNN, a migration é aplicada e db/upgrade/NNNN_post.sql confere a conversão dos dados.
for pre in "$ROOT"/db/upgrade/*_pre.sql; do
  [ -e "$pre" ] || continue
  number="$(basename "$pre" _pre.sql)"
  previous="$(printf '%04d' $((10#$number - 1)))"
  upgrade_db="${DB}_up_$number"
  "${PSQL[@]}" -d postgres -c "drop database if exists \"$upgrade_db\"" -c "create database \"$upgrade_db\""
  "$ROOT/scripts/db/migrate.sh" "$upgrade_db" "$previous" >/dev/null
  "${PSQL[@]}" -d "$upgrade_db" -f "$pre"
  "$ROOT/scripts/db/migrate.sh" "$upgrade_db" >/dev/null
  "${PSQL[@]}" -d "$upgrade_db" -f "$ROOT/db/upgrade/${number}_post.sql"
  "${PSQL[@]}" -d postgres -c "drop database \"$upgrade_db\""
  echo "ok    atualização $number"
done
