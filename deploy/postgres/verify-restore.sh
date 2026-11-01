#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
SELECT to_regclass('public.tenants') AS tenants_table,
       to_regclass('public.tasks') AS tasks_table,
       to_regclass('public.ai_proposal_tasks') AS ai_proposal_tasks_table;
SQL

for table in tenants tasks ai_proposal_tasks audit_logs; do
  count="$(psql "$DATABASE_URL" -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public.\"$table\";")"
  printf '%s rows=%s\n' "$table" "$count"
done
