#!/bin/sh
# Herstelt een database-dump in een (nieuwe) database.
#
# Gebruik:   restore.sh <dumpbestand> <doeldatabase>
# Bestaat de doeldatabase al, dan stopt het script — tenzij FORCE=1 (dan wordt die eerst verwijderd).
# Omgeving:  PGHOST PGUSER PGPASSWORD (libpq). Optioneel RESTORE_UPLOADS=<archief.tar.gz> UPLOADS_DIR=<map>.
set -eu

dump=${1:-}
target=${2:-}
if [ -z "$dump" ] || [ -z "$target" ]; then
  echo "Gebruik: $0 <dumpbestand> <doeldatabase>" >&2
  exit 2
fi
[ -f "$dump" ] || { echo "Dumpbestand niet gevonden: $dump" >&2; exit 2; }

# Controleer eerst de checksum als die naast de dump staat
dir=$(dirname "$dump")
base=$(basename "$dump")
ts=${base#db-}
ts=${ts%.dump}
if [ -f "$dir/SHA256SUMS-$ts" ]; then
  (cd "$dir" && grep " $base\$" "SHA256SUMS-$ts" | sha256sum -c -) || { echo "Checksum klopt niet: dump is beschadigd" >&2; exit 1; }
fi

exists=$(psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$target'")
if [ "$exists" = "1" ]; then
  if [ "${FORCE:-0}" != "1" ]; then
    echo "Database '$target' bestaat al. Gebruik FORCE=1 om die te overschrijven." >&2
    exit 1
  fi
  psql -d postgres -qc "DROP DATABASE \"$target\" WITH (FORCE)"
fi
psql -d postgres -qc "CREATE DATABASE \"$target\""
pg_restore --no-owner --exit-on-error --dbname="$target" "$dump"
echo "[restore] $dump hersteld in database '$target'"

if [ -n "${RESTORE_UPLOADS:-}" ]; then
  : "${UPLOADS_DIR:?UPLOADS_DIR is nodig bij RESTORE_UPLOADS}"
  mkdir -p "$UPLOADS_DIR"
  tar -xzf "$RESTORE_UPLOADS" -C "$UPLOADS_DIR"
  echo "[restore] uploads hersteld in $UPLOADS_DIR"
fi
