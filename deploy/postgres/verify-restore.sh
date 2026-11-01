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
PG_URL="$(libpq_url "$DATABASE_URL")"

psql "$PG_URL" -v ON_ERROR_STOP=1 <<'SQL'
SELECT to_regclass('public.tenants') AS tenants_table,
       to_regclass('public.tasks') AS tasks_table,
       to_regclass('public.ai_proposal_tasks') AS ai_proposal_tasks_table;
SQL

for table in tenants tasks ai_proposal_tasks audit_logs; do
  count="$(psql "$PG_URL" -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public.\"$table\";")"
  printf '%s rows=%s\n' "$table" "$count"
done
