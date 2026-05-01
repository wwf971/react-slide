#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

DATE=$(date +"%Y%m%d")
TIME=$(date +"%H%M%S")
CS=$(python3 -c "import datetime; print(f'{datetime.datetime.now().microsecond // 10000:02d}')")
TZ_OFF=$(date +"%z" | sed 's/\([+-][0-9][0-9]\)[0-9][0-9]/\1/')
TIMESTAMP="${DATE}_${TIME}${CS}${TZ_OFF}"

OUTFILE="${SCRIPT_DIR}/${TIMESTAMP}.sql"

PGPASSWORD=mypassword /opt/homebrew/opt/libpq/bin/pg_dump \
  -h 127.0.0.1 \
  -p 5432 \
  -U myuser \
  slides > "$OUTFILE"

echo "$OUTFILE"
