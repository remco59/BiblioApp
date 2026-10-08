# Beheerhandleiding

Voor wie BiblioApp installeert, bijwerkt en beheert. Gebruikers- en rolbeheer in de app staat onder “Dagelijks beheer”.

## 1. Wat draait er?

Eén server met Docker Compose (`deploy/docker-compose.prod.yml`):

| Service      | Taak                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------- |
| `web`        | Caddy: HTTPS (Let's Encrypt, automatisch), statische site, reverse proxy naar de API         |
| `api`        | NestJS-API; past bij het opstarten databasemigraties toe                                     |
| `postgres`   | PostgreSQL 16 (volume `pgdata`)                                                              |
| `backup`     | Dagelijkse back-up (database + covers), optioneel offsite via rclone, wekelijkse hersteltest |
| `prometheus` | Optioneel (`--profile monitoring`), metrics en alerts                                        |

Architectuurdiagram: [architectuur.md](architectuur.md).

## 2. Eerste installatie

**Vereist**: een server (1 vCPU / 2 GB RAM is genoeg voor een kleine bibliotheek), Docker met Compose-plugin, een domeinnaam waarvan het A/AAAA-record naar de server wijst, poorten 80 en 443 open, en een SMTP-server voor e-mail.

```bash
sudo mkdir -p /opt/biblio && sudo chown $USER /opt/biblio && cd /opt/biblio
# 1. bestanden: de deploy-pipeline kopieert ze (zie §3); handmatig kan ook:
#    scp deploy/docker-compose.prod.yml  server:/opt/biblio/docker-compose.yml  (en de mappen backup/ en monitoring/)

# 2. configuratie
cp .env.production.example .env && chmod 600 .env     # vul alles in (zie hieronder)
touch rclone.conf && chmod 600 rclone.conf            # leeg laten als je geen offsite-kopie wilt

# 3. starten
docker compose pull
docker compose up -d
docker compose ps        # alle services "healthy"
```

**Belangrijke instellingen in `.env`**

| Variabele                             | Betekenis                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------- |
| `SITE_ADDRESS`                        | Je domein, bijv. `bibliotheek.example.nl`                                           |
| `POSTGRES_PASSWORD`                   | Lang, willekeurig wachtwoord                                                        |
| `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM` | Mailserver voor verificatie, reset en meldingen                                     |
| `METRICS_TOKEN`                       | Token (≥ 16 tekens) waarmee Prometheus `/api/metrics` mag lezen                     |
| `PAYMENT_PROVIDER`                    | `none` tot een echte betaalprovider is gekoppeld (`mock` is geweigerd in productie) |
| `IMAGE_TAG`                           | Welke versie draait; de pipeline zet dit                                            |

De API **start niet** als de configuratie in productie onveilig of onvolledig is (bijv. `WEB_ORIGIN` zonder https, standaard S3-sleutels, ontbrekend metrics-token); de foutmelding staat in `docker compose logs api`.

**Eerste beheerder aanmaken.** Registreer een account op de site (verificatiemail!) en promoveer het daarna in de database:

```bash
docker compose exec postgres psql -U biblio -c "UPDATE \"User\" SET role='ADMIN' WHERE email='jij@example.nl'"
```

Daarna beheer je rollen in de app (Beheer → Gebruikers). Er worden **geen demo-accounts** aangemaakt in productie.

## 3. Updates uitrollen (CI/CD)

Elke merge op `main` met groene CI bouwt de images (`ghcr.io/<owner>/<repo>/api` en `/web`) en rolt uit via SSH (`.github/workflows/deploy.yml`).
Activeren in GitHub (Settings → Environments → `production`, en Settings → Variables):

| Soort                      | Naam                         | Waarde                                           |
| -------------------------- | ---------------------------- | ------------------------------------------------ |
| Variable (repo)            | `DEPLOY_ENABLED`             | `true`                                           |
| Variable (repo)            | `SITE_ADDRESS`               | je domein (voor de rooktest)                     |
| Variable (repo, optioneel) | `DEPLOY_PATH`                | standaard `/opt/biblio`                          |
| Secret (`production`)      | `DEPLOY_HOST`, `DEPLOY_USER` | server en gebruiker met Docker-rechten           |
| Secret (`production`)      | `DEPLOY_SSH_KEY`             | privésleutel (alleen voor deploy; dedicated key) |

De pipeline voert uit: images bouwen en pushen → compose-bestanden kopiëren → `docker compose pull && up -d` → wachten op `/api/health/ready`. De API past migraties zelf toe.
Mislukt de rooktest, dan blijft de vorige configuratie bewaard in `.env.previous`.

**Terugdraaien**: `cd /opt/biblio && cp .env.previous .env && docker compose up -d`. Let op: database-migraties worden niet automatisch teruggedraaid; schrijf migraties daarom
altijd _uitbreidend_ (kolom toevoegen, niet hernoemen/verwijderen in dezelfde release).

## 4. Dagelijks beheer

- **Rollen en accounts** (Beheer → Gebruikers): rol wijzigen of account uitschakelen; sessies van die gebruiker vervallen direct. Je kunt jezelf niet uitschakelen en de laatste beheerder niet verwijderen.
- **Instellingen** (Beheer → Instellingen): uitleentermijn, verlengingen, leenlimiet, boetetarieven, ophaaltermijn reserveringen, herinneringen en **bewaartermijnen**.
- **E-mailteksten** (Beheer → Mailteksten): NL en EN, met plaatshouders; “Standaardtekst herstellen” zet terug.
- **Auditlog** (Beheer → Auditlog): wie deed wat (inloggen, uitlenen, beheeracties, privacy-acties).
- **Nachtelijke job** draait om 03:00; handmatig starten kan via Instellingen → “Nu uitvoeren”.
- **Aanmaningen**: Te laat-overzicht voor handmatige aanmaning; automatische aanmaning herhaalt na het ingestelde aantal dagen.

## 5. Back-ups en herstel

**Wat wordt er gebackupt?** Dagelijks om `BACKUP_HOUR_UTC` (standaard 02:00 UTC): een `pg_dump` (custom-formaat) met controle op leesbaarheid, een archief van de geüploade covers, checksums, en — als `BACKUP_REMOTE` is ingesteld — een **offsite kopie** (rclone, daarna gecontroleerd met `rclone check`).
Lokaal blijven `BACKUP_RETENTION_DAYS` (14) dagen bewaard in het volume `backups`. De API-uitleengegevens staan allemaal in de database; covers in het volume `uploads` (of in S3).

**Offsite instellen**: kopieer `deploy/rclone.conf.example` naar `rclone.conf`, vul de sleutels in, zet `BACKUP_REMOTE=s3remote:biblio-backups` in `.env`, en test met
`docker compose run --rm backup rclone lsd s3remote:`.

**Hersteltest (automatisch)**: elke zondag, en bij elke CI-run, wordt de laatste dump teruggezet in een tijdelijke database en vergeleken met de bron (tabelaantallen, extensie `pg_trgm`, zoek- en integriteitsindexen). Handmatig:

```bash
docker compose exec backup verify-restore.sh          # laatste dump
docker compose exec backup cat /backups/last-success  # tijdstip laatste geslaagde back-up
```

**Herstelprocedure (bewezen in CI: `deploy/backup/test.sh`)**

```bash
cd /opt/biblio
docker compose stop web api                                   # geen schrijfverkeer tijdens herstel
docker compose exec backup ls -1t /backups | head              # kies een dump: db-<datum>.dump

# 1. herstel naar een NIEUWE database (controleert ook de checksum)
docker compose exec backup restore.sh /backups/db-20261008T020000Z.dump biblio_restored

# 2. controleer (tabelaantallen) en wissel
docker compose exec postgres psql -U biblio -d biblio_restored -c 'SELECT count(*) FROM "Loan"'
docker compose exec postgres psql -U biblio -d postgres -c 'ALTER DATABASE biblio RENAME TO biblio_old'
docker compose exec postgres psql -U biblio -d postgres -c 'ALTER DATABASE biblio_restored RENAME TO biblio'

# 3. covers terugzetten (indien nodig)
docker run --rm -v biblio_uploads:/data -v biblio_backups:/backups alpine \
  tar -xzf /backups/uploads-20261008T020000Z.tar.gz -C /data

docker compose up -d
curl -fsS https://$SITE_ADDRESS/api/health/ready
# als alles klopt: oude database opruimen
docker compose exec postgres psql -U biblio -d postgres -c 'DROP DATABASE biblio_old'
```

Bij een volledig verloren server: nieuwe server → §2, de offsite dump terughalen (`rclone copy s3remote:biblio-backups /tmp/b`), daarna bovenstaande herstelstappen.
**Oefen dit minstens één keer per jaar** op een testserver en noteer de duur (doel: herstel binnen een uur, maximaal 24 uur dataverlies door de dagelijkse frequentie).

## 6. Monitoring

- **Logs**: JSON op stdout. `docker compose logs -f api`; zoek op `reqId` (zelfde als de header `X-Request-Id` in de browser). Wachtwoorden, tokens en cookies worden uit de logs gewist.
- **Health**: `/api/health` (leeft), `/api/health/ready` (database + migraties + job-queue). Docker en Caddy gebruiken dit; koppel ook een externe uptime-monitor aan `https://<domein>/api/health/ready`.
- **Metrics (Prometheus)**: `printf '%s' "$METRICS_TOKEN" > monitoring/metrics-token`, dan `docker compose --profile monitoring up -d`. Prometheus luistert alleen op `127.0.0.1:9090` (gebruik een SSH-tunnel: `ssh -L 9090:localhost:9090 server`).
  `/api/metrics` is publiek **niet** bereikbaar (Caddy geeft 404); Prometheus scrapet binnen het Docker-netwerk.
- **Alerts** (`monitoring/alerts.yml`): API onbereikbaar, verhoogd 5xx-percentage, trage verzoeken (p95 > 1 s), onverzonden e-mails, veel te late boeken, hoog geheugengebruik. Koppel Alertmanager of Grafana aan je e-mail/chat.
  Zet ook een extern alarm op de leeftijd van `/backups/last-success`.
- **Sentry** (foutmeldingen) is optioneel en niet ingebouwd; de gestructureerde logs en metrics dekken de basis.

## 7. Beveiliging

Wat er is ingebouwd staat in [architectuur.md](architectuur.md#beveiliging). Checklist voor jou:

- [ ] `.env` en `rclone.conf` zijn `chmod 600` en niet in git; sleutels roteer je minimaal jaarlijks of bij vertrek van een beheerder.
- [ ] SSH alleen met sleutels; firewall: alleen 22 (beperkt), 80 en 443 open. Poort 9090 staat nooit open.
- [ ] Server-updates (`unattended-upgrades`) en Docker-images up-to-date: Dependabot-PR's wekelijks beoordelen; CI faalt op bekende kwetsbaarheden in productie-afhankelijkheden (`pnpm audit --prod`).
- [ ] 2FA aanzetten voor alle beheerders en bibliothecarissen (Profiel → Tweestapsverificatie) en herstelcodes veilig bewaren.
- [ ] Offsite back-up ingesteld én de herstelprocedure geoefend.
- [ ] Rate limits: algemeen 300 verzoeken/min/IP (`RATE_LIMIT_MAX`), inloggen/registreren/wachtwoord-vergeten 10/min/IP (`AUTH_RATE_LIMIT_MAX`). Deze tellers zitten in het geheugen van één API-proces (zie Schalen).

## 8. AVG / privacy

- **Bewaartermijnen** (instelbaar): afgesloten uitleningen en afgehandelde boetes 24 maanden, gelezen meldingen 90 dagen, auditlog 12 maanden, inactieve leden worden 36 maanden na afloop van het lidmaatschap geanonimiseerd. De nachtelijke job voert dit uit. Gevolg: rapportages over populaire boeken gaan niet verder terug dan de uitleentermijn.
- **Inzage/overdracht**: leden downloaden al hun gegevens zelf (Profiel → Gegevens exporteren, JSON).
- **Verwijderen**: leden verwijderen hun account zelf (Profiel → Account verwijderen), of een beheerder doet het (`POST /api/admin/users/:id/anonymize`). Dat kan niet met geleende boeken of openstaande boetes; beheerdersaccounts moeten eerst een lagere rol krijgen. Het account wordt geanonimiseerd (naam, e-mail, wachtwoord, 2FA, meldingen, reviews, verlanglijst, suggesties weg); historische uitleenrijen blijven tot de bewaartermijn verstrijkt, maar zijn niet meer herleidbaar.
- **Openbare privacyverklaring**: `/privacy` toont de actuele bewaartermijnen; pas de tekst aan je organisatie aan (verwerkingsverantwoordelijke, contactgegevens) in `apps/web/src/pages/PrivacyPage.tsx`.
- **Back-ups** bevatten persoonsgegevens: ze verlopen na 14 dagen lokaal en volgens het beleid van je offsite-bucket (stel daar een lifecycle-regel in). Een verwijderverzoek werkt dus pas na die termijn volledig door in back-ups; vermeld dat in je privacyverklaring.
- **Verwerkersovereenkomsten** sluit je zelf met je hostingpartij, mailprovider en eventuele betaalprovider.

## 9. Betaalprovider koppelen

Online boetebetaling gebruikt de interface `PaymentProvider` (`apps/api/src/payments/payments.service.ts`). Standaard bestaat alleen de `mock`-provider (ontwikkeling). Voor een echte provider (bijv. Mollie):

1. Implementeer `createCheckout` (betaling aanmaken, betaal-URL teruggeven) en `fetchStatus` (status opvragen bij de provider).
2. Registreer de provider in `PaymentsService` op basis van `PAYMENT_PROVIDER` en zet de API-sleutel als secret in `.env`.
3. Stel de webhook van de provider in op `POST https://<domein>/api/payments/webhook` met `{ "providerRef": "<id>" }` (of laat een kleine adapter dat formaat maken). De API vertrouwt de body niet: de status wordt bij de provider opgevraagd en een betaling wordt maar één keer geboekt.
4. Test in de sandbox van de provider; zet daarna `PAYMENT_PROVIDER` op de nieuwe waarde.

## 10. Schalen en grenzen

De belastingtest ([load-test.md](load-test.md)) toont ~110 zoekopdrachten/s en vlotte uitleenflow op één kleine VM; boven ~20 gelijktijdige gebruikers loopt de latency op. Opties, in volgorde:
meer CPU/RAM; Postgres-tuning (`shared_buffers`, `work_mem`); meerdere API-instanties achter Caddy. Dan moeten de in-memory rate limits en de realtime-events (SSE) gedeeld worden (bijv. Redis); de job-queue (pg-boss) en de rij-locks werken al correct met meerdere instanties.

## 11. Problemen oplossen

| Symptoom                                            | Oorzaak / oplossing                                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API start niet, logs tonen “Ongeldige configuratie” | Ontbrekende of onveilige variabele in `.env` (zie melding)                                                                                                   |
| `/api/health/ready` geeft 503                       | `database:false` → Postgres onbereikbaar; `migrations:false` → migratie loopt of mislukte (`docker compose logs api`); `jobs:false` → job-queue niet gestart |
| Geen e-mails                                        | `docker compose logs api                                                                                                                                     | grep -i mail`; controleer SMTP-gegevens. Mislukte e-mails worden door de job-queue opnieuw geprobeerd; het alert “EmailBacklog” waarschuwt |
| Lid kan niet inloggen                               | Account niet geverifieerd (stuur opnieuw via “wachtwoord vergeten”), geblokkeerd/uitgeschakeld, of 2FA-code nodig; herstelcodes werken één keer              |
| Certificaatfout                                     | DNS wijst niet naar de server of poort 80/443 dicht; `docker compose logs web`                                                                               |
| Zoeken traag                                        | `ANALYZE` draaien; controleer of de indexen bestaan (`deploy/backup/verify-restore.sh` meldt dit ook); zie load-test                                         |
