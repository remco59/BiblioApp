#!/bin/sh
# Bouwt het productiepakket van de API (zoals deploy/Dockerfile.api), start het met een productieconfiguratie
# en controleert health, readiness, beveiligingsheaders en metrics. Vereist: gebouwde API (pnpm build) en een
# gemigreerde database in DATABASE_URL.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
pid=""
cleanup() { [ -n "$pid" ] && kill "$pid" 2>/dev/null || true; rm -rf "$work"; }
trap cleanup EXIT
: "${DATABASE_URL:?DATABASE_URL is nodig}"

cd "$root"
pnpm --filter @biblio/api deploy --prod --legacy "$work/app" >/dev/null 2>&1
(cd "$work/app" && npx prisma generate >/dev/null 2>&1)

port=${SMOKE_PORT:-3199}
token="smoke-token-0123456789abcdef"
(cd "$work/app" && env -i PATH="$PATH" NODE_ENV=production DATABASE_URL="$DATABASE_URL" \
  WEB_ORIGIN=https://bibliotheek.example.nl SMTP_HOST=smtp.example.nl MAIL_FROM="Bieb <noreply@example.nl>" \
  METRICS_TOKEN="$token" STORAGE_DIR="$work/uploads" API_PORT="$port" node dist/main.js > "$work/api.log" 2>&1) &
pid=$!

i=0
until curl -fsS "http://127.0.0.1:$port/api/health/ready" > "$work/ready.json" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -gt 40 ]; then echo "API werd niet gereed:"; cat "$work/api.log"; exit 1; fi
  sleep 1
done
echo "ready:   $(cat "$work/ready.json")"

check() { # <omschrijving> <commando…>
  desc=$1; shift
  if "$@" >/dev/null 2>&1; then echo "ok:      $desc"; else echo "MISLUKT: $desc"; cat "$work/api.log" | tail -20; exit 1; fi
}
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
check "metrics zonder token → 401"    test "$(code "http://127.0.0.1:$port/api/metrics")" = 401
check "metrics met token → 200"       test "$(code -H "Authorization: Bearer $token" "http://127.0.0.1:$port/api/metrics")" = 200
check "swagger-docs uit → 404"        test "$(code "http://127.0.0.1:$port/api/docs")" = 404
check "catalogus publiek → 200"       test "$(code "http://127.0.0.1:$port/api/books")" = 200
check "beschermde route → 401"        test "$(code "http://127.0.0.1:$port/api/me/membership")" = 401
check "HSTS-header aanwezig"          sh -c "curl -sI http://127.0.0.1:$port/api/health | grep -qi '^strict-transport-security'"
check "CSP-header aanwezig"           sh -c "curl -sI http://127.0.0.1:$port/api/health | grep -qi '^content-security-policy'"
check "geen cookies/tokens in logs"   sh -c "! grep -qi 'supergeheim' '$work/api.log'"
curl -s -H "Cookie: sid=supergeheim" -H "Authorization: Bearer supergeheim" "http://127.0.0.1:$port/api/auth/me" >/dev/null
check "redactie van gevoelige headers" sh -c "! grep -qi 'supergeheim' '$work/api.log'"
check "logs zijn JSON"                sh -c "head -n 1 '$work/api.log' | grep -q '^{'"
echo "Productie-rooktest: OK"
