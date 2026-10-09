import { money } from '../lib/format';
import { period, useRules } from '../lib/useRules';

/** "Zo werkt lenen": de regels in gewone taal, op basis van de echte instellingen. */
export function LoanRules() {
  const r = useRules();
  if (!r) return null;
  return (
    <section className="rules" aria-labelledby="rules-h">
      <h2 id="rules-h">Zo werkt lenen</h2>
      <ul>
        <li>
          <strong>Ophalen:</strong> pak het boek uit de kast en laat het met je bibliotheekpas
          uitlenen aan de balie.
        </li>
        <li>
          <strong>Termijn:</strong> je leent een boek {period(r.loanDays)} en kunt het{' '}
          {r.maxRenewals}× met {period(r.renewalDays)} verlengen, zolang niemand anders erop wacht.
          Je hebt maximaal {r.maxLoansPerMember} boeken tegelijk.
        </li>
        <li>
          <strong>Reserveren:</strong> is een boek uitgeleend, dan reserveer je het. Je krijgt een
          melding zodra het klaarligt en hebt dan {period(r.reservationHoldDays)} om het op te
          halen.
        </li>
        <li>
          <strong>Te laat:</strong> {money(r.finePerDayCents)} per dag, nooit meer dan{' '}
          {money(r.fineCapCents)} per boek. We sturen je een herinnering voordat het zover is.
        </li>
      </ul>
    </section>
  );
}
