#!/bin/sh
# Maakt een back-up van de database (pg_dump, custom-formaat) en de geüploade covers, controleert de dump,
# kopieert naar een offsite locatie (rclone) en ruimt oude back-ups op.
#
# Omgeving: PGHOST PGUSER PGPASSWORD PGDATABASE (standaard libpq)
#           BACKUP_DIR (./backups)  UPLOADS_DIR (optioneel)  RETENTION_DAYS (14)
#           BACKUP_REMOTE (optioneel, rclone-pad zoals "s3remote:biblio-backups")
set -eu

BACKUP_DIR=${BACKUP_DIR:-./backups}
RETENTION_DAYS=${RETENTION_DAYS:-14}
mkdir -p "$BACKUP_DIR"

ts=$(date -u +%Y%m%dT%H%M%SZ)
dump="db-$ts.dump"
log() { echo "[backup] $*"; }

log "database dumpen → $dump"
pg_dump --format=custom --no-owner --file="$BACKUP_DIR/$dump.partial"
# Integriteitscontrole: de inhoudsopgave van de dump moet leesbaar zijn
pg_restore --list "$BACKUP_DIR/$dump.partial" > /dev/null
mv "$BACKUP_DIR/$dump.partial" "$BACKUP_DIR/$dump"

files="$dump"
if [ -n "${UPLOADS_DIR:-}" ] && [ -d "$UPLOADS_DIR" ]; then
  uploads="uploads-$ts.tar.gz"
  log "uploads archiveren → $uploads"
  tar -czf "$BACKUP_DIR/$uploads" -C "$UPLOADS_DIR" .
  files="$files $uploads"
fi

sums="SHA256SUMS-$ts"
# shellcheck disable=SC2086
(cd "$BACKUP_DIR" && sha256sum $files > "$sums")
log "checksums → $sums"

if [ -n "${BACKUP_REMOTE:-}" ]; then
  log "offsite kopiëren naar $BACKUP_REMOTE"
  rclone copy "$BACKUP_DIR" "$BACKUP_REMOTE" --include "*-$ts*"
  rclone check "$BACKUP_DIR" "$BACKUP_REMOTE" --include "*-$ts*" --one-way
  log "offsite kopie gecontroleerd"
fi

log "back-ups ouder dan $RETENTION_DAYS dagen opruimen"
find "$BACKUP_DIR" -type f \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' -o -name 'SHA256SUMS-*' \) -mtime +"$RETENTION_DAYS" -delete

date -u +%Y-%m-%dT%H:%M:%SZ > "$BACKUP_DIR/last-success"
log "klaar ($dump)"
