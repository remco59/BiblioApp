import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

interface Policy {
  retentionLoanMonths: number;
  retentionAuditMonths: number;
  retentionNotificationDays: number;
  retentionInactiveMemberMonths: number;
}

export function PrivacyPage() {
  const [p, setP] = useState<Policy | null>(null);
  useEffect(() => {
    api.GET('/api/privacy/policy').then(({ data }) => setP(data ?? null));
  }, []);

  return (
    <article className="prose">
      <h1>Privacy</h1>
      <p>
        De bibliotheek verwerkt alleen de gegevens die nodig zijn om boeken uit te lenen, te
        reserveren en je te waarschuwen.
      </p>

      <h2>Welke gegevens bewaren we?</h2>
      <ul>
        <li>
          <strong>Account:</strong> naam, e-mailadres, (versleuteld) wachtwoord, taalvoorkeur en
          eventueel 2FA-instellingen.
        </li>
        <li>
          <strong>Lidmaatschap:</strong> lidnummer en einddatum.
        </li>
        <li>
          <strong>Uitleen:</strong> welke boeken je hebt geleend, wanneer, en eventuele boetes en
          betalingen.
        </li>
        <li>
          <strong>Reserveringen, verlanglijst, suggesties en reviews</strong> die je zelf aanmaakt.
        </li>
        <li>
          <strong>Meldingen</strong> die we je sturen (in de app en per e-mail).
        </li>
        <li>
          <strong>Beveiligingslog:</strong> wie wanneer wat deed (inloggen, uitlenen, beheeracties).
        </li>
      </ul>

      <h2>Hoe lang bewaren we ze?</h2>
      {p ? (
        <ul>
          <li>
            Afgesloten uitleningen en afgehandelde boetes:{' '}
            <strong>{p.retentionLoanMonths} maanden</strong> na afloop.
          </li>
          <li>
            Gelezen meldingen: <strong>{p.retentionNotificationDays} dagen</strong>.
          </li>
          <li>
            Beveiligingslog: <strong>{p.retentionAuditMonths} maanden</strong>.
          </li>
          <li>
            Leden zonder activiteit en met een verlopen lidmaatschap worden{' '}
            <strong>{p.retentionInactiveMemberMonths} maanden</strong> na afloop automatisch
            geanonimiseerd.
          </li>
        </ul>
      ) : (
        <p>Laden…</p>
      )}

      <h2>Jouw rechten</h2>
      <ul>
        <li>
          <strong>Inzage en overdracht:</strong> download al je gegevens via{' '}
          <Link to="/profile">je profiel</Link> (“Gegevens exporteren”).
        </li>
        <li>
          <strong>Correctie:</strong> pas je naam en taal aan in je profiel; vraag de balie om een
          ander e-mailadres.
        </li>
        <li>
          <strong>Verwijderen:</strong> je kunt je account laten verwijderen in je profiel. Je
          gegevens worden dan gewist of onherkenbaar gemaakt. Dat kan pas als je geen boeken meer
          geleend hebt en geen boetes open hebt staan.
        </li>
      </ul>
      <p>Vragen? Neem contact op met de balie van de bibliotheek.</p>
    </article>
  );
}
