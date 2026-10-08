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
];

export function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    api.GET('/api/staff/settings').then(({ data }) => setS(data ?? null));
  }, []);

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
    </>
  );
}
