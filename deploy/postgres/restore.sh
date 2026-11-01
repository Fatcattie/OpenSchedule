#!/usr/bin/env bash
set -euo pipefail

# DATABASE_URL 与 Prisma 共用，可能带 Prisma 专用参数（schema / connection_limit / pgbouncer …）；
# libpq（psql/pg_dump/pg_restore）遇到未知 URI 参数直接报错，交给 libpq 前剔除，sslmode 等 libpq 参数保留。
libpq_url() {
  local url="$1" base query kv kept=""
  local -a parts
  base="${url%%\?*}"
  [ "$base" = "$url" ] && { printf '%s' "$url"; return; }
  query="${url#*\?}"
  IFS='&' read -ra parts <<<"$query"
  for kv in "${parts[@]}"; do
    case "${kv%%=*}" in
      schema|connection_limit|pool_timeout|pgbouncer|statement_cache_size|socket_timeout|sslaccept) ;;
      *) kept="${kept:+$kept&}$kv" ;;
    esac
  done
  printf '%s%s' "$base" "${kept:+?$kept}"
}

: "${DATABASE_URL:?DATABASE_URL must be set}"
DUMP_PATH="${1:?usage: restore.sh <dump-file> [target-database-url]}"
TARGET_DATABASE_URL="$(libpq_url "${2:-$DATABASE_URL}")"

[ -r "$DUMP_PATH" ] || { printf 'Backup file is not readable: %s\n' "$DUMP_PATH" >&2; exit 1; }
pg_restore --exit-on-error --no-owner --clean --if-exists --dbname="$TARGET_DATABASE_URL" "$DUMP_PATH"
printf 'PostgreSQL backup restored to the target database.\n'
