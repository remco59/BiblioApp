#!/bin/sh
# Hersteltest: zet de laatste (of opgegeven) dump terug in een tijdelijke database en controleert die.
#
# Gebruik:  verify-restore.sh [--strict] [dumpbestand]
#   --strict  aantallen moeten exact gelijk zijn aan de bron (voor CI, waar niets verandert na de back-up)
#   zonder    herstelde aantallen mogen lager zijn dan de bron (er is sindsdien data bijgekomen/verwijderd),
#             maar tabellen die in de bron gevuld zijn, mogen niet leeg zijn.
# Omgeving: PGHOST PGUSER PGPASSWORD PGDATABASE (de bron), BACKUP_DIR.
set -eu

strict=0
if [ "${1:-}" = "--strict" ]; then strict=1; shift; fi
BACKUP_DIR=${BACKUP_DIR:-./backups}
dump=${1:-$(ls -1 "$BACKUP_DIR"/db-*.dump 2>/dev/null | sort | tail -n 1)}
[ -n "$dump" ] && [ -f "$dump" ] || { echo "Geen dump gevonden in $BACKUP_DIR" >&2; exit 2; }

source_db=${PGDATABASE:?PGDATABASE (brondatabase) is nodig}
tmp="biblio_verify_$$"
here=$(dirname "$0")
trap 'psql -d postgres -qc "DROP DATABASE IF EXISTS \"$tmp\" WITH (FORCE)" >/dev/null 2>&1 || true' EXIT

echo "[verify] $dump → tijdelijke database $tmp"
"$here/restore.sh" "$dump" "$tmp" > /dev/null

count() { psql -d "$1" -tAc "SELECT count(*) FROM \"$2\""; }
fail=0
for table in User Member Book Author Copy Loan Fine Reservation Notification Setting AuditLog _prisma_migrations; do
  src=$(count "$source_db" "$table")
  restored=$(count "$tmp" "$table")
  status=ok
  if [ "$strict" = 1 ]; then
    [ "$src" = "$restored" ] || status="VERSCHIL"
  else
    if [ "$restored" -gt "$src" ]; then status="VERSCHIL"; fi
    if [ "$src" -gt 0 ] && [ "$restored" -eq 0 ]; then status="LEEG"; fi
  fi
  [ "$status" = ok ] || fail=1
  printf '[verify] %-20s bron=%-6s hersteld=%-6s %s\n' "$table" "$src" "$restored" "$status"
done

# Het zoekmechanisme moet werken in de herstelde database (extensie + indexen)
ext=$(psql -d "$tmp" -tAc "SELECT count(*) FROM pg_extension WHERE extname = 'pg_trgm'")
idx=$(psql -d "$tmp" -tAc "SELECT count(*) FROM pg_indexes WHERE indexname IN ('Book_title_trgm_idx','Author_name_trgm_idx','Book_fts_idx','Loan_copyId_active_key','Reservation_active_key','Reservation_ready_copy_key','Fine_overdue_per_loan_key')")
psql -d "$tmp" -tAc "SELECT count(*) FROM \"Book\" WHERE \"title\" ILIKE '%a%' OR word_similarity('a', \"title\") > 0.5" > /dev/null
printf '[verify] pg_trgm=%s zoek- en integriteitsindexen=%s/7\n' "$ext" "$idx"
[ "$ext" = 1 ] && [ "$idx" = 7 ] || fail=1

if [ "$fail" = 0 ]; then echo "[verify] OK: back-up is te herstellen"; else echo "[verify] MISLUKT" >&2; fi
exit "$fail"
