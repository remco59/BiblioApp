import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../../api';

type Tpl = {
  type: string;
  locale: string;
  subject: string;
  body: string;
  customized: boolean;
  defaultSubject: string;
  defaultBody: string;
  placeholders: string[];
};

const NAMES: Record<string, string> = {
  RESERVATION_READY: 'Reservering ligt klaar',
  RESERVATION_EXPIRED: 'Reservering verlopen',
  LOAN_DUE_SOON: 'Herinnering vóór vervaldatum',
  LOAN_OVERDUE: 'Aanmaning te laat',
  MEMBERSHIP_EXPIRING: 'Lidmaatschap loopt af',
  WISHLIST_AVAILABLE: 'Verlangd boek beschikbaar',
  SUGGESTION_UPDATED: 'Update aankoopsuggestie',
  REVIEW_MODERATED: 'Review beoordeeld',
};

export function TemplatesPage() {
  const [all, setAll] = useState<Tpl[]>([]);
  const [locale, setLocale] = useState<'nl' | 'en'>('nl');
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string }>>({});
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.GET('/api/admin/email-templates');
    setAll(data ?? []);
    setEdits({});
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const key = (t: Tpl) => `${t.type}/${t.locale}`;
  async function save(t: Tpl) {
    const e = edits[key(t)] ?? { subject: t.subject, body: t.body };
    const { error } = await api.PUT('/api/admin/email-templates/{type}/{locale}', {
      params: { path: { type: t.type, locale: t.locale } },
      body: e,
    });
    setMessage(error ? errorMessage(error) : `“${NAMES[t.type]}” (${t.locale}) opgeslagen`);
    void load();
  }
  async function reset(t: Tpl) {
    await api.DELETE('/api/admin/email-templates/{type}/{locale}', {
      params: { path: { type: t.type, locale: t.locale } },
    });
    setMessage(`“${NAMES[t.type]}” (${t.locale}) hersteld naar de standaardtekst`);
    void load();
  }

  return (
    <>
      <h1>E-mailtemplates</h1>
      <p>
        Teksten van meldingen en e-mails. Gebruik plaatshouders zoals <code>{'{{title}}'}</code>,{' '}
        <code>{'{{date}}'}</code>, <code>{'{{days}}'}</code>, <code>{'{{amount}}'}</code>,{' '}
        <code>{'{{status}}'}</code> en <code>{'{{note}}'}</code>. Wijzigingen gelden voor nieuwe
        meldingen.
      </p>
      <div role="tablist" aria-label="Taal" className="tabs">
        {(['nl', 'en'] as const).map((l) => (
          <button
            key={l}
            role="tab"
            aria-selected={locale === l}
            className={locale === l ? '' : 'secondary'}
            onClick={() => setLocale(l)}
          >
            {l === 'nl' ? 'Nederlands' : 'English'}
          </button>
        ))}
      </div>
      {message && <p role="status">{message}</p>}
      {all
        .filter((t) => t.locale === locale)
        .map((t) => {
          const e = edits[key(t)] ?? { subject: t.subject, body: t.body };
          return (
            <section key={key(t)} className="card-box">
              <h2>
                {NAMES[t.type]} {t.customized && <small>(aangepast)</small>}
              </h2>
              <label className="field">
                <span>Onderwerp</span>
                <input
                  value={e.subject}
                  onChange={(ev) =>
                    setEdits({ ...edits, [key(t)]: { ...e, subject: ev.target.value } })
                  }
                />
              </label>
              <label className="field">
                <span>Tekst</span>
                <textarea
                  rows={3}
                  value={e.body}
                  onChange={(ev) =>
                    setEdits({ ...edits, [key(t)]: { ...e, body: ev.target.value } })
                  }
                />
              </label>
              <button onClick={() => void save(t)}>Opslaan</button>{' '}
              {t.customized && (
                <button className="secondary" onClick={() => void reset(t)}>
                  Standaardtekst herstellen
                </button>
              )}
            </section>
          );
        })}
    </>
  );
}
