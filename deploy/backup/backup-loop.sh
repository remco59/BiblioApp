#!/bin/sh
# Draait dagelijks om BACKUP_HOUR_UTC een back-up; op zondag aansluitend een hersteltest.
# Bij een fout wordt na een uur opnieuw geprobeerd; de fout staat in de logs (en Prometheus-alert via last-success).
set -u
BACKUP_DIR=${BACKUP_DIR:-/backups}
HOUR=${BACKUP_HOUR_UTC:-2}
log() { echo "[loop] $*"; }

seconds_until() {
  now=$(date -u +%s)
  today=$(date -u +%Y-%m-%d)
  next=$(date -u -d "$today $(printf '%02d' "$HOUR"):00:00" +%s 2>/dev/null || date -u -D '%Y-%m-%d %H:%M:%S' -d "$today $(printf '%02d' "$HOUR"):00:00" +%s)
  [ "$next" -le "$now" ] && next=$((next + 86400))
  echo $((next - now))
}

run() {
  if backup.sh; then
    if [ "$(date -u +%u)" = 7 ]; then verify-restore.sh || log "HERSTELTEST MISLUKT"; fi
    return 0
  fi
  return 1
}

if ! ls "$BACKUP_DIR"/db-*.dump >/dev/null 2>&1; then
  log "nog geen back-up aanwezig: nu eerst een back-up maken"
  run || log "eerste back-up mislukt"
fi
while true; do
  wait=$(seconds_until)
  log "volgende back-up over ${wait}s"
  sleep "$wait"
  until run; do
    log "back-up mislukt; over een uur opnieuw"
    sleep 3600
  done
done
