#!/usr/bin/env bash
# Daily logical backup of the Nirogix PostgreSQL database (Phase 0 Ops — resources/development-plan.md
# §18 Backups & DR). This complements the managed-Postgres provider's automated daily backups +
# PITR; it gives an application-owned, portable dump that the restore drill (restore-drill.sh)
# exercises. Run from cron on the VM (or a dedicated backup host):
#
#   0 2 * * *  /opt/hms/deploy/backup/backup.sh >> /var/log/hms-backup.log 2>&1
#
# Required env (from the service user's environment / a root-only env file — never committed):
#   DATABASE_URL         postgres connection string
#   BACKUP_DIR           local staging dir for dumps            (default: /var/backups/hms)
#   BACKUP_RETENTION_DAYS  days of local dumps to keep          (default: 14)
#   R2_REMOTE            optional rclone remote:bucket/prefix for off-box copy (e.g. r2:hms-backups)
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/hms}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/hms-${STAMP}.dump"

echo "[backup] $(date -u) → $OUT"
# Custom format (-Fc) = compressed + selective restore; the format restore-drill.sh expects.
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$OUT"

# Integrity check: the dump must list its contents without error.
pg_restore --list "$OUT" > /dev/null
echo "[backup] verified dump table-of-contents OK"

# Off-box copy (survives VM loss). Requires rclone configured with the R2 remote.
if [[ -n "${R2_REMOTE:-}" ]]; then
  echo "[backup] uploading to $R2_REMOTE"
  rclone copy "$OUT" "$R2_REMOTE" --immutable
fi

# Prune old local dumps.
find "$BACKUP_DIR" -name 'hms-*.dump' -mtime "+${RETENTION_DAYS}" -print -delete || true
echo "[backup] done"
