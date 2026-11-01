#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
DUMP_PATH="${1:?usage: restore.sh <dump-file> [target-database-url]}"
TARGET_DATABASE_URL="${2:-$DATABASE_URL}"

[ -r "$DUMP_PATH" ] || { printf 'Backup file is not readable: %s\n' "$DUMP_PATH" >&2; exit 1; }
pg_restore --exit-on-error --no-owner --clean --if-exists --dbname="$TARGET_DATABASE_URL" "$DUMP_PATH"
printf 'PostgreSQL backup restored to the target database.\n'
