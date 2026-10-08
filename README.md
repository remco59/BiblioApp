# BiblioApp

Bibliotheekbeheer: catalogus, uitleen, reserveringen en meldingen.

## Documentatie

- [Beheerhandleiding](docs/beheerhandleiding.md): installeren, bijwerken, back-ups en herstel, monitoring, AVG
- [Architectuur](docs/architectuur.md): onderdelen, domeinmodel, beveiliging, achtergrondwerk
- [Toegankelijkheid](docs/accessibility.md): axe-audit, handmatige checklist, PWA
- [Belastingtest](docs/load-test.md): methode en resultaten voor zoeken en de uitleenflow

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

## Reserveringen en meldingen (fase 5)

- **Reserveren** (`POST /api/me/reservations`): alleen als er geen exemplaar beschikbaar is. Wachtrij
  op volgorde van reserveren; één actieve reservering per lid per boek (database-index), limiet per lid.
- **Klaarleggen**: bij inname (of nieuw/hersteld exemplaar) krijgt de eerste in de rij het exemplaar
  (`RESERVED_HOLD`) met ophaaltermijn (standaard 5 dagen). Dat exemplaar is alleen uit te lenen aan die
  reserveerder; de balie krijgt de melding “LEG APART”. De wachtrij per boek wordt serieel verwerkt
  met een rij-lock op het boek (`SKIP LOCKED` op exemplaren), er is een test met parallelle inname.
- **Verlopen** reserveringen schuiven door naar de volgende; verlengen is niet mogelijk zolang iemand wacht.
- **Job-queue** (pg-boss, schema `pgboss` in dezelfde Postgres): e-mailverzending met retries en een
  nachtelijke job om 03:00 voor herinneringen vóór de uiterste datum, aanmaningen en boetes voor te late
  boeken (één boete per uitleen, dagelijks bijgewerkt), verlopen reserveringen en lidmaatschapscontrole.
  Admins kunnen de job handmatig starten (`POST /api/admin/jobs/nightly`, of via Instellingen). Met
  `JOBS_DISABLED=1` draaien jobs inline (tests).
- **Meldingen**: in-app (`/notifications`, belletje met teller) en per e-mail, templates in NL en EN
  (taalvoorkeur in het profiel).
- **Realtime** via Server-Sent Events (`GET /api/events`): beschikbaarheid (iedereen) en eigen meldingen.
- **Staff**: overzicht te late boeken met handmatige aanmaning (`/staff/overdue`) en alle reserveringen.

## Community en rapportage (fase 6)

- **Reviews en sterren**: alleen leden die het boek hebben geleend; elke review (en elke wijziging) gaat
  eerst langs moderatie (`/staff/moderation`); gemiddelde en verdeling op de boekpagina en in de catalogus.
- **Verlanglijst** (`/my/wishlist`) met melding zodra een verlangd boek beschikbaar komt (niet bij
  klaarleggen voor een reservering, niet voor wie het net inleverde, niet dubbel zolang ongelezen).
- **Aankoopsuggesties** indienen (`/my/suggestions`) en afhandelen door medewerkers (status + opmerking
  → melding aan het lid).
- **Aanbevelingen**: “vergelijkbare boeken” op score (auteur, reeks, genre, trefwoorden, beoordeling) en
  “Aanbevolen voor jou” op basis van geleende boeken en verlanglijst.
- **Rapportages** (`/staff/reports`, `GET /api/staff/reports/*`): populairste boeken, uitleenvolume (per
  dag/maand), achterstanden en boete-inkomsten; elk met `?format=csv`.
- **Admin**: gebruikers en rollen (sessies vervallen bij wijziging; geen zelf-uitsluiting en altijd
  minimaal één actieve admin), account uitschakelen, auditlog-viewer en aanpasbare e-mailtemplates
  (plaatshouders `{{title}}`, `{{date}}`, …; terugzetten naar standaard mogelijk).
- **2FA (TOTP)**: instellen met QR-code in het profiel, 10 eenmalige herstelcodes (gehasht opgeslagen),
  een code werkt maar één keer (geen replay). Zelf geïmplementeerd volgens RFC 6238 en getest met de
  RFC-testvectoren.
- **Online boetebetaling** via een provider-interface (`PaymentProvider`). Standaard (buiten productie)
  de `mock`-provider met een nep-betaalpagina (`/pay/mock/:ref`). In productie is online betalen uit
  tot je een echte provider koppelt: implementeer `PaymentProvider` (`createCheckout` en `fetchStatus`,
  bv. voor Mollie), registreer die in `PaymentsService` en wijs je webhook naar
  `POST /api/payments/webhook {providerRef}`; de status wordt altijd bij de provider opgevraagd en een
  betaling wordt idempotent geboekt. Zet `PAYMENT_PROVIDER=none` om het uit te zetten.

## Productie (fase 7)

Zie de [beheerhandleiding](docs/beheerhandleiding.md). In het kort:

- **Deployen**: `deploy/docker-compose.prod.yml` (Caddy met automatisch HTTPS → API → Postgres + back-upcontainer), images via `deploy/Dockerfile.*`, uitrol via `.github/workflows/deploy.yml` (images naar GHCR, SSH-deploy, rooktest).
- **Back-ups**: dagelijks `pg_dump` + covers, checksums, optioneel offsite (rclone); hersteltest wekelijks én in CI (`deploy/backup/test.sh`).
- **Monitoring**: JSON-logs (pino), `/api/health` en `/api/health/ready`, Prometheus-metrics op `/api/metrics` (token) met alertregels.
- **Beveiliging**: helmet + CSP/HSTS (Caddy en API), algemene rate limit, strikte productieconfiguratie (`validateEnv`), `pnpm audit --prod` in CI, Dependabot.
- **AVG**: bewaartermijnen en anonimisering via de nachtelijke job, account zelf verwijderen, volledige gegevensexport, `/privacy`.
- **Toegankelijkheid en PWA**: axe in CI, installeerbare app met offline app-shell (nooit API-data in de cache).
- **Belasting**: `pnpm --filter @biblio/api load:seed` en `load:run`.
