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

## Authenticatie (fase 2)

Zelfgebouwd: argon2id-hashing, sessies in Postgres (httpOnly-cookie `sid`, 7 dagen),
CSRF-token per sessie (header `X-CSRF-Token` bij POST/PATCH/DELETE; komt mee in `/api/auth/me`
en de login-respons), rate limiting op login/registratie/wachtwoord-vergeten, e-mailverificatie
en wachtwoordreset (mails zichtbaar in Mailpit op http://localhost:8025). Rollen `MEMBER`,
`LIBRARIAN`, `ADMIN` worden server-side afgedwongen met een globale guard; routes zijn standaard
beschermd, publieke routes krijgen `@Public()`, rolbeperking `@Roles(...)`.

Demo-accounts na `pnpm db:seed` (alleen buiten productie), wachtwoord `Welkom-123456`:
`lid@biblio.nl`, `bibliothecaris@biblio.nl`, `admin@biblio.nl`.

TOTP-2FA is optioneel in het issue en is bewust nog niet gebouwd (staat ook in fase 6).

## Catalogus (fase 3)

- **Zoeken** (`GET /api/books?q=…`): Postgres full-text (Nederlands) + `pg_trgm` voor typefouten, over
  titel, beschrijving, auteur, tag en ISBN; bij 0 resultaten komt er een “bedoelde je…”-suggestie.
  Filters: genre, taal, jaar, tag, alleen beschikbaar; sorteren en pagineren. Beschikbaarheid wordt
  altijd afgeleid uit de exemplaren (geen opgeslagen tellers).
- **Beheer** (bibliothecaris/admin, `/staff/*`): boeken, exemplaren (automatische barcodes),
  auteurs/genres/tags/reeksen, ISBN-lookup (Open Library, fallback Google Books), cover-upload,
  CSV-import en -export (`isbn,title,authors,genres,…`; meerdere waarden gescheiden door `;`).
- **Covers**: S3/MinIO als `S3_ENDPOINT` is gezet, anders lokaal in `apps/api/uploads`.
- **Thema**: licht/donker/automatisch (rechtsboven); skip-link, labels en focus-stijlen voor WCAG AA.

### Tests

`pnpm test` draait unit- en integratietests. De end-to-end tests voor zoeken en beheer draaien met
`pnpm --filter @biblio/web test:e2e` (vereist draaiende Postgres met seed-data; start API en web zelf).
Lokaal kun je `PW_CHROMIUM=/pad/naar/chromium` zetten om een bestaande browser te gebruiken.

## Uitleenproces (fase 4)

- **Balie** (`/staff/desk`): uitlenen en innemen via barcodescanner (typt de code + Enter) of camera
  (BarcodeDetector-API, waar de browser dat ondersteunt). Resultaten verschijnen direct in een logboek.
- **Uitlenen is één transactie**: het exemplaar en het lid worden met `SELECT … FOR UPDATE` vergrendeld,
  zodat parallelle uitleningen elkaar niet kunnen passeren; een partiële unieke index
  (`Loan_copyId_active_key`) is het vangnet in de database. Er is een concurrency-test voor.
- **Controles**: leenlimiet, geblokkeerd lid, geldig lidmaatschap, openstaande boetes (vanaf een drempel).
- **Verlengen** door lid (`/my/loans`) of medewerker, met maximum, niet als te laat, niet bij
  reservering (haak `LoansService.hasWaitingReservation`, ingevuld in fase 5).
- **Boetes**: per begonnen dag te laat (met maximum) bij inname; beschadigd en verloren hebben vaste
  kosten. Betalen (deels), kwijtschelden en lid blokkeren/deblokkeren/lidmaatschap verlengen via `/staff/members`.
- **Instellingen** (`/admin/settings`, alleen admin): termijnen, limieten en tarieven staan in de database.
- **Etiketten** (`/staff/labels`): Code128-barcodes, afdrukvriendelijk.
- Foutcodes: de API geeft bij domeinfouten `{ message, code }` (bijv. `COPY_LOANED`, `LOAN_LIMIT`).
