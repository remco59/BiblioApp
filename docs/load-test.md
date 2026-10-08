# Belastingtest

Doel: aantonen dat zoeken en de uitleenflow snel blijven bij een realistische collectie en dat gelijktijdig uitlenen **nooit** tot dubbele uitleen leidt.

## Uitvoeren

```bash
createdb biblio_load
export DATABASE_URL="postgresql://biblio:biblio@localhost:5432/biblio_load?schema=public"
pnpm --filter @biblio/api db:deploy
pnpm --filter @biblio/api load:seed          # 5000 boeken, ~9800 exemplaren, 600 leden (LOAD_BOOKS / LOAD_MEMBERS aan te passen)
psql "$DATABASE_URL" -c ANALYZE

# API starten met ruime limieten (de algemene rate limit zou de test anders afkappen)
pnpm --filter @biblio/api build
RATE_LIMIT_MAX=1000000 AUTH_RATE_LIMIT_MAX=1000000 API_PORT=3300 LOG_PRETTY=0 node apps/api/dist/main.js &

BASE_URL=http://localhost:3300 DURATION_S=15 CONCURRENCY=20 pnpm --filter @biblio/api load:run
```

Het script (`apps/api/load/run.ts`) draait vier scenario's, rapporteert p50/p95/p99 per scenario en faalt (exitcode 1) bij overschreden drempels of integriteitsfouten:

| Scenario       | Wat                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| A. zoeken      | Gemengde zoekopdrachten: één woord, twee woorden, typefout, auteur, filters + sortering, paginering          |
| B. bladeren    | Lijst (willekeurige pagina), boekdetail (met vergelijkbare boeken), filteropties                             |
| C. uitleenflow | N gelijktijdige balies die elk herhaald uitlenen en innemen (eigen exemplaar en lid)                         |
| D. wedstrijd   | 20 rondes van 50 gelijktijdige uitleenpogingen op **hetzelfde** exemplaar: per ronde moet precies één slagen |

Na afloop controleert het script in de database: geen exemplaar met meerdere actieve uitleningen, geen blijvend openstaande uitleningen en de exemplaarstatus komt overeen met de uitleenstatus.
Drempels (p95): zoeken 400 ms, detail 250 ms, lijst 250 ms, filters 200 ms, uitlenen/innemen 500 ms.

## Resultaten (8 okt 2026, ontwikkel-VM)

Alles draaide op **één gedeelde VM** (API, Postgres, load-generator en JSON-logging op `info`, zonder tuning): de cijfers zijn dus pessimistisch ten opzichte van een eigen server.

**20 gelijktijdige gebruikers, 15 s per fase — alle drempels gehaald**

| Scenario                        | Verzoeken | Fout% |    p50 |    p95 |    p99 |
| ------------------------------- | --------: | ----: | -----: | -----: | -----: |
| zoeken                          |      1636 |     0 | 175 ms | 290 ms | 334 ms |
| detail                          |       911 |     0 | 118 ms | 147 ms | 155 ms |
| lijst                           |       581 |     0 |  52 ms |  70 ms |  79 ms |
| filters                         |       354 |     0 |  34 ms |  47 ms |  54 ms |
| uitlenen                        |      1385 |     0 | 101 ms | 132 ms | 160 ms |
| innemen                         |      1405 |     0 | 109 ms | 142 ms | 178 ms |
| uitleen-wedstrijd (50 parallel) |      1000 |     0 | 150 ms | 246 ms | 263 ms |

Integriteit: 0 dubbele actieve uitleningen, 0 status-inconsistenties, **20 van 20 wedstrijdrondes met precies één winnaar**.

**50 gelijktijdige gebruikers**: geen enkele fout en dezelfde integriteitsuitkomst, maar de latency stijgt lineair omdat de (enkele) API-processen en Postgres de VM-CPU delen:
zoeken p95 578 ms, detail p95 385 ms, uitlenen p95 294 ms. Dat overschrijdt de drempels voor zoeken en detail; capaciteit boven ~20 gelijktijdige gebruikers vraagt dus een
sterkere server of meerdere API-instanties (zie “Schalen” in de beheerhandleiding).

## Wat de test heeft opgeleverd

De eerste meting liet zien dat zoeken **niet** schaalde (p95 6,1 s bij 20 gebruikers, 99 verzoeken in 12 s). Oorzaak: één `WHERE … OR …` met niet-indexeerbare functies
(`word_similarity()` als functie, per rij een auteur-subquery), waardoor Postgres de hele tabel doorzocht. De zoekopdracht is herschreven naar een kandidatenlijst via `UNION` van
index-gedekte voorwaarden (GIN full-text, trigram `<%`/`ILIKE`, ISBN) waarna alleen die kandidaten worden gescoord. Resultaat: p95 6084 ms → 290 ms en 13× meer verzoeken in dezelfde tijd.
Ook de “vergelijkbare boeken”/aanbevelingen laden nu eerst lichte kandidaten en pas daarna de volledige gegevens voor de uiteindelijke selectie.

Daarnaast bleek tijdens de hersteltest dat twee trigram-indexen eerder door een automatisch gegenereerde migratie waren verwijderd (Prisma kent ze niet); die zijn hersteld en nu in het schema vastgelegd.

## In CI

De workflow `load.yml` draait de test handmatig (`workflow_dispatch`); hij is bewust geen onderdeel van elke PR omdat de uitkomst afhangt van de runner.
