#!/usr/bin/env bash
# Restore DRILL — the plan requires restore to be *drilled, not just configured*, before the
# first paying customer (resources/development-plan.md §18, §23). This restores the latest
# dump into a throwaway scratch database and sanity-checks it, so a real recovery is a proven
# path, not a hope. Safe to run on a schedule (weekly) against a non-production DB server.
#
#   DATABASE_URL=... deploy/backup/restore-drill.sh [/path/to/specific.dump]
#
# Env:
#   DATABASE_URL   admin connection (used to CREATE/DROP the scratch DB)
#   BACKUP_DIR     where dumps live (default: /var/backups/hms)
#   DRILL_DB       scratch DB name  (default: hms_restore_drill)
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/hms}"
DRILL_DB="${DRILL_DB:-hms_restore_drill}"

DUMP="${1:-$(ls -1t "$BACKUP_DIR"/hms-*.dump 2>/dev/null | head -1)}"
[[ -n "$DUMP" && -f "$DUMP" ]] || { echo "[drill] no dump found in $BACKUP_DIR"; exit 1; }
echo "[drill] restoring $DUMP → database '$DRILL_DB'"

# Derive an admin URL to the 'postgres' maintenance DB to create/drop the scratch DB.
ADMIN_URL="$(echo "$DATABASE_URL" | sed -E 's#/[^/?]+(\?|$)#/postgres\1#')"
DRILL_URL="$(echo "$DATABASE_URL" | sed -E "s#/[^/?]+(\?|$)#/${DRILL_DB}\1#")"

psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${DRILL_DB};"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DRILL_DB};"

# Restore into the scratch DB.
pg_restore --no-owner --no-privileges --dbname="$DRILL_URL" "$DUMP"

# Sanity checks: core tables must exist and the tenant table must have rows.
TENANTS=$(psql "$DRILL_URL" -tAc "SELECT count(*) FROM tenants;")
USERS=$(psql "$DRILL_URL" -tAc "SELECT count(*) FROM users;")
echo "[drill] restored: tenants=${TENANTS} users=${USERS}"
[[ "$TENANTS" -ge 1 ]] || { echo "[drill] FAIL: no tenants after restore"; exit 1; }

# Clean up the scratch DB (comment out to inspect it manually).
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${DRILL_DB};"
echo "[drill] PASS — restore verified, scratch DB dropped. Record RTO in the runbook."
