#!/bin/sh
# Past openstaande databasemigraties toe en start daarna de API.
set -eu
echo "Migraties toepassen…"
npx prisma migrate deploy
exec node dist/main.js
