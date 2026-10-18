#!/usr/bin/env bash
# CANTUM — cópia do banco (pg_dump, formato custom). Docs: docs/BACKUP_RECOVERY.md.
# Uso: DATABASE_URL=<conexão DIRETA> scripts/ops/dump.sh [pasta_destino]
# Nunca imprime DATABASE_URL. O arquivo tem dados pessoais: fica com permissão 600.
set -euo pipefail
: "${DATABASE_URL:?defina DATABASE_URL (veja docs/BACKUP_RECOVERY.md, passo 1)}"
DIR="${1:-.}"
OUT="$DIR/cantum-$(date +%F-%H%M).dump"
umask 077
pg_dump "$DATABASE_URL" --format=custom --no-owner --file "$OUT"
echo "Cópia criada: $OUT ($(wc -c <"$OUT" | tr -d ' ') bytes)"
