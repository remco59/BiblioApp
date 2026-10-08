# Toegankelijkheid (WCAG 2.1 AA)

## Automatisch (elke CI-run)

`apps/web/e2e/a11y.spec.ts` draait **axe-core** (tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`) op de belangrijkste schermen:

- publiek: catalogus (ook met zoekterm en filters), boekdetail, inloggen, registreren, wachtwoord vergeten, privacy;
- lid: mijn uitleningen, verlanglijst, suggesties, meldingen, profiel;
- medewerker: balie, leden, collectiebeheer, reserveringen, te late boeken, moderatie, rapporten, etiketten;
- beheerder: instellingen, gebruikers, mailteksten, auditlog;
- donker thema en mobiele breedte (360 px).

Een controletest bewijst dat axe bekende fouten (ontbrekende alt-tekst, labels, contrast) ook echt vindt, zodat de audit niet vanzelf slaagt.

## Handmatige checklist

Uit te voeren bij elke grotere UI-wijziging (afvinken in de PR):

- [ ] **Toetsenbord**: alles bereikbaar met Tab/Shift+Tab, logische volgorde, zichtbare focus (3 px oranje omlijning), geen toetsenbordval. “Naar de inhoud”-link werkt.
- [ ] **Schermlezer** (NVDA/VoiceOver): koppen (h1 → h2) kloppen; formulieren hebben labels; foutmeldingen (`role="alert"`) en statusmeldingen (`role="status"`) worden voorgelezen; sterren hebben een tekstalternatief (“4 van 5 sterren”).
- [ ] **Zoom 200% en 400%** (reflow): geen horizontaal scrollen op 320 px breedte behalve in tabellen (die scrollen binnen hun eigen container).
- [ ] **Alleen kleur is nooit de enige informatiedrager**: beschikbaarheid heeft ook ✓/✗ en tekst.
- [ ] **Contrast**: licht en donker thema; controle met axe (automatisch) en handmatig op nieuwe kleuren.
- [ ] **Bewegingsvoorkeur**: er zijn geen animaties die essentiële informatie dragen.
- [ ] **Barcode-camera**: de balie werkt ook volledig zonder camera (handscanner = toetsenbord of handmatig invoeren).
- [ ] **Taal**: `lang="nl"` op de pagina.

## Status van de handmatige audit

De automatische axe-controle is uitgevoerd en geslaagd. De **handmatige checklist hierboven is nog niet uitgevoerd door een mens** (geen schermlezer of
fysieke apparaten beschikbaar tijdens de bouw). Voer die uit vóór livegang en noteer de uitkomst hieronder.

| Datum              | Uitgevoerd door | Hulpmiddel | Resultaat |
| ------------------ | --------------- | ---------- | --------- |
| _nog in te vullen_ |                 |            |           |

## Bekende beperkingen

- De camera-scanner gebruikt de `BarcodeDetector`-API en werkt daardoor alleen in browsers die dat ondersteunen; er is altijd een tekstveld als alternatief.
- Omslagafbeeldingen hebben `alt`-tekst; ontbrekende covers tonen een beschreven plaatshouder.

## PWA

De app is installeerbaar (manifest met 192/512 px- en maskable-iconen, `display: standalone`) en de app-shell werkt offline. De service worker cachet **nooit** API-antwoorden
(persoonsgegevens, actuele beschikbaarheid); dat wordt in `apps/web/e2e/pwa.spec.ts` getest.
