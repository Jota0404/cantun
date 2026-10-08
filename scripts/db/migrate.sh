#!/usr/bin/env bash
# CANTUM — aplica as migrations de db/migrations ainda não registradas (ADR-059).
#
# Uso: scripts/db/migrate.sh <banco>
#   <banco> é o nome do banco ou uma connection string. A conexão usa as
#   variáveis PG* padrão (PGHOST, PGPORT, PGUSER, PGPASSWORD). Nunca imprime a
#   connection string.
#
# Cada arquivo roda em uma transação junto com o registro em
# app.schema_migrations; se falhar, nada daquele arquivo fica aplicado.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="${1:?uso: scripts/db/migrate.sh <banco>}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

"${PSQL[@]}" -c "set client_min_messages = warning" -c "create schema if not exists app" \
  -c "create table if not exists app.schema_migrations (version text primary key, applied_at timestamptz not null default now())"

applied="$("${PSQL[@]}" -tA -c "select version from app.schema_migrations")"

for file in "$ROOT"/db/migrations/*.sql; do
  version="$(basename "$file" .sql)"
  if grep -qx "$version" <<<"$applied"; then
    continue
  fi
  "${PSQL[@]}" -o /dev/null --single-transaction -f "$file" \
    -c "insert into app.schema_migrations (version) values ('$version')"
  echo "aplicada  $version"
done
