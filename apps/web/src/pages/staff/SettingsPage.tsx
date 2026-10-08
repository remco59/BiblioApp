import { useEffect, useState, type FormEvent } from 'react';
import type { Settings } from '@biblio/api-client';
import { api, errorMessage } from '../../api';

const FIELDS: [keyof Settings, string, string][] = [
  ['loanDays', 'Uitleentermijn', 'dagen'],
  ['maxRenewals', 'Maximaal aantal keer verlengen', 'keer'],
  ['renewalDays', 'Verlengtermijn', 'dagen'],
  ['maxLoansPerMember', 'Maximaal aantal boeken per lid', 'boeken'],
  ['finePerDayCents', 'Boete per dag te laat', 'cent'],
  ['fineCapCents', 'Maximale boete per uitleen', 'cent'],
  ['blockFinesThresholdCents', 'Uitleenblokkade vanaf openstaande boete', 'cent'],
  ['lostFeeCents', 'Kosten verloren boek', 'cent'],
  ['damagedFeeCents', 'Kosten beschadigd boek', 'cent'],
  ['membershipMonths', 'Duur lidmaatschap bij verlengen', 'maanden'],
  ['reservationHoldDays', 'Ophaaltermijn gereserveerd boek', 'dagen'],
  ['maxReservationsPerMember', 'Maximaal aantal reserveringen per lid', 'reserveringen'],
  ['reminderDays', 'Herinnering vóór uiterste datum', 'dagen'],
  ['overdueNoticeEveryDays', 'Aanmaning herhalen na', 'dagen'],
  ['membershipNoticeDays', 'Waarschuwing vóór einde lidmaatschap', 'dagen'],
  ['retentionLoanMonths', 'AVG: bewaartermijn afgesloten uitleningen en boetes', 'maanden'],
  ['retentionAuditMonths', 'AVG: bewaartermijn auditlog', 'maanden'],
  ['retentionNotificationDays', 'AVG: bewaartermijn gelezen meldingen', 'dagen'],
  ['retentionInactiveMemberMonths', 'AVG: inactieve leden anonimiseren na', 'maanden'],
];

export function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    api.GET('/api/staff/settings').then(({ data }) => setS(data ?? null));
  }, []);

  const [job, setJob] = useState<string | null>(null);
  async function runJob() {
    const { data, error } = await api.POST('/api/admin/jobs/nightly');
    setJob(
      data
        ? `Klaar: ${data.reminders} herinneringen, ${data.overdueNotices} aanmaningen, ${data.finesUpdated} boetes bijgewerkt, ${data.reservationsExpired} reserveringen verlopen, ${data.membershipNotices} lidmaatschapsmeldingen, ${data.retentionDeleted} verouderde records verwijderd, ${data.membersAnonymized} leden geanonimiseerd`
        : errorMessage(error),
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!s) return;
    const { data, error } = await api.PATCH('/api/admin/settings', { body: s });
    if (data) {
      setS(data);
      setMessage({ text: 'Instellingen opgeslagen' });
    } else setMessage({ text: errorMessage(error), error: true });
  }

  if (!s) return <p>Laden…</p>;
  return (
    <>
      <h1>Instellingen</h1>
      <form onSubmit={save} className="book-form">
        {FIELDS.map(([key, label, unit]) => (
          <label key={key} className="field">
            <span>
              {label} ({unit})
            </span>
            <input
              type="number"
              min={0}
              value={s[key]}
              onChange={(e) => setS({ ...s, [key]: Number(e.target.value) })}
            />
          </label>
        ))}
        {message && (
          <p role={message.error ? 'alert' : 'status'} className={message.error ? 'error' : ''}>
            {message.text}
          </p>
        )}
        <button type="submit">Opslaan</button>
      </form>
      <h2>Nachtelijke job</h2>
      <p>
        Herinneringen, aanmaningen, boetes, verlopen reserveringen en lidmaatschapscontrole draaien
        elke nacht om 03:00. Je kunt de job hier ook direct uitvoeren.
      </p>
      <button className="secondary" onClick={() => void runJob()}>
        Nu uitvoeren
      </button>
      {job && <p role="status">{job}</p>}
    </>
  );
}
