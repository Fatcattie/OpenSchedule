#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
OUTPUT_PATH="${1:-backups/openschedule-$(date -u +%Y%m%dT%H%M%SZ).dump}"

mkdir -p "$(dirname "$OUTPUT_PATH")"
pg_dump --format=custom --no-owner --file="$OUTPUT_PATH" "$DATABASE_URL"
printf 'PostgreSQL backup written to %s\n' "$OUTPUT_PATH"
