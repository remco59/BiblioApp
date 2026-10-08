# BiblioApp

Bibliotheekbeheer: catalogus, uitleen, reserveringen en meldingen.

## Stack

- **API**: NestJS (Fastify), Prisma, PostgreSQL — `apps/api`
- **Web**: React + Vite + TypeScript — `apps/web`
- **Gedeeld**: `packages/shared` (constanten/types), `packages/api-client` (gegenereerd uit OpenAPI)

## Opstarten

Vereist: Node 22, pnpm 10, Docker (voor Postgres, MinIO en Mailpit).

```bash
cp .env.example .env
cp .env apps/api/.env
docker compose up -d        # Postgres :5432, MinIO :9000/:9001, Mailpit :8025
pnpm install
pnpm --filter @biblio/shared build
pnpm db:migrate             # schema aanmaken
pnpm db:seed                # voorbeelddata (10 boeken, 4 genres)
pnpm dev                    # API :3000, web :5173
```

- Web: http://localhost:5173
- API: http://localhost:3000/api/books, Swagger: http://localhost:3000/api/docs
- Mailpit: http://localhost:8025

## Scripts

| Script           | Doel                                                     |
| ---------------- | -------------------------------------------------------- |
| `pnpm build`     | Alles bouwen                                             |
| `pnpm lint`      | ESLint                                                   |
| `pnpm typecheck` | TypeScript                                               |
| `pnpm test`      | Tests (API tegen database `biblio_test`)                 |
| `pnpm openapi`   | OpenAPI-spec genereren en `api-client` opnieuw genereren |

Na een API-wijziging: draai `pnpm openapi` en commit `apps/api/openapi.json` en
`packages/api-client/src/schema.ts` (CI controleert dit).
