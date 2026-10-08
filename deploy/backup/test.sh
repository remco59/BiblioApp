#!/bin/sh
# Rooktest voor back-up en herstel (draait in CI en lokaal tegen een bestaande, gemigreerde database).
# Gebruik: PGHOST=… PGUSER=… PGPASSWORD=… PGDATABASE=… ./test.sh
set -eu
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export BACKUP_DIR="$work/backups" UPLOADS_DIR="$work/uploads" RETENTION_DAYS=14
mkdir -p "$UPLOADS_DIR"
echo "cover-bytes" > "$UPLOADS_DIR/1-abc.png"

# Nep-rclone zodat de offsite-stap getest kan worden zonder externe opslag
mkdir -p "$work/bin"
cat > "$work/bin/rclone" <<'STUB'
#!/bin/sh
echo "rclone $*" >> "$RCLONE_LOG"
case "$1" in
  copy) mkdir -p "$REMOTE_DIR"; src="$2"; shift 3; for f in "$src"/*; do case "$f" in *-"$TS"*|*) cp "$f" "$REMOTE_DIR"/ ;; esac; done ;;
  check) diff -rq "$2" "$REMOTE_DIR" >/dev/null 2>&1 || true ;;
esac
STUB
chmod +x "$work/bin/rclone"
export RCLONE_LOG="$work/rclone.log" REMOTE_DIR="$work/remote" TS=""

echo "== 1. back-up (met offsite)"
PATH="$work/bin:$PATH" BACKUP_REMOTE="fake:biblio" "$here/backup.sh"
ls "$BACKUP_DIR"
test -s "$BACKUP_DIR/last-success"
ls "$BACKUP_DIR"/db-*.dump >/dev/null
ls "$BACKUP_DIR"/uploads-*.tar.gz >/dev/null
grep -q "^rclone copy" "$RCLONE_LOG" && grep -q "^rclone check" "$RCLONE_LOG"
ls "$REMOTE_DIR"/db-*.dump >/dev/null

echo "== 2. hersteltest (strikt)"
"$here/verify-restore.sh" --strict

echo "== 3. checksum bewaakt: een beschadigde dump wordt geweigerd"
dump=$(ls "$BACKUP_DIR"/db-*.dump)
cp "$dump" "$work/orig.dump"
echo "corrupt" >> "$dump"
if "$here/restore.sh" "$dump" "biblio_restore_corrupt_$$" 2>/dev/null; then echo "FOUT: beschadigde dump werd hersteld" >&2; exit 1; fi
cp "$work/orig.dump" "$dump"

echo "== 4. herstel naar een nieuwe database, bestaande database wordt niet overschreven zonder FORCE"
target="biblio_restore_test_$$"
"$here/restore.sh" "$dump" "$target" >/dev/null
if "$here/restore.sh" "$dump" "$target" 2>/dev/null; then echo "FOUT: overschreven zonder FORCE" >&2; exit 1; fi
FORCE=1 "$here/restore.sh" "$dump" "$target" >/dev/null
psql -d postgres -qc "DROP DATABASE \"$target\" WITH (FORCE)"

echo "== 5. uploads terugzetten"
mkdir -p "$work/restored-uploads"
ts=$(basename "$dump" .dump); ts=${ts#db-}
tar -xzf "$BACKUP_DIR/uploads-$ts.tar.gz" -C "$work/restored-uploads"
test "$(cat "$work/restored-uploads/1-abc.png")" = "cover-bytes"

echo "Back-up en herstel: OK"
