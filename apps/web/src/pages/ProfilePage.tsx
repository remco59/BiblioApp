import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { MemberDetail } from '@biblio/api-client';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { DeleteAccount } from '../components/DeleteAccount';
import { TwoFactor } from '../components/TwoFactor';
import { SectionHeader, Shelf, ShelfBook } from '../components/Shelf';
import { dateNl } from '../lib/format';
import { useBooks } from '../lib/useBooks';

const ROLE: Record<string, string> = {
  MEMBER: 'Lid',
  LIBRARIAN: 'Bibliothecaris',
  ADMIN: 'Beheerder',
};

export function ProfilePage() {
  const { user, setUser, logout } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [m, setM] = useState<MemberDetail | null>(null);
  useEffect(() => {
    if (!user?.memberNumber) return;
    api.GET('/api/me/membership').then(({ data }) => setM(data ?? null));
  }, [user?.memberNumber]);
  const active = m?.loans.filter((l) => !l.returnedAt) ?? [];
  const dueSoon = active
    .filter((l) => new Date(l.dueAt).getTime() - Date.now() < 5 * 86_400_000)
    .slice(0, 4);
  const overdue = active.filter((l) => l.overdue).length;
  const books = useBooks(dueSoon.map((l) => l.bookId));

  async function save(e: FormEvent) {
    e.preventDefault();
    const { error } = await api.PATCH('/api/users/me', { body: { name } });
    if (error) return setMessage({ text: errorMessage(error), error: true });
    if (user) setUser({ ...user, name });
    setMessage({ text: 'Je naam is opgeslagen.' });
  }

  async function setLocale(locale: 'nl' | 'en') {
    const { error } = await api.PATCH('/api/users/me', { body: { locale } });
    if (!error && user) setUser({ ...user, locale });
  }

  async function download() {
    const res = await fetch('/api/users/me/export', { credentials: 'include' });
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mijn-gegevens.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!user) return null;
  return (
    <>
      <h1>Mijn profiel</h1>

      <div className="profile-grid">
        <section aria-labelledby="card-h" className="profile-section">
          <h2 id="card-h" className="sr-only">
            Bibliotheekpas
          </h2>
          <div className="library-card">
            <span className="card-label">Bibliotheekpas</span>
            <span className="number">{user.memberNumber ?? '—'}</span>
            <span className="card-name">{user.name}</span>
            {m && <span>Lid tot en met {dateNl(m.membershipUntil)}</span>}
          </div>
          {m && (
            <p className="card-status">
              <Link to="/my/loans">
                {active.length === 0
                  ? 'Je hebt nu niets geleend'
                  : `${active.length} ${active.length === 1 ? 'boek' : 'boeken'} geleend`}
              </Link>
              {dueSoon.length > 0 && <> · {dueSoon.length} binnenkort terug</>}
              {overdue > 0 && <span className="bad"> · {overdue} te laat</span>}
            </p>
          )}
        </section>

        <section className="panel profile-section" aria-labelledby="account-h">
          <h2 id="account-h">Account</h2>
          <dl>
            <dt>E-mailadres</dt>
            <dd>{user.email}</dd>
            <dt>Rol</dt>
            <dd>{ROLE[user.role] ?? user.role}</dd>
          </dl>
          <button className="secondary" onClick={() => void logout()}>
            Uitloggen
          </button>
        </section>
      </div>

      {dueSoon.length > 0 && (
        <section aria-labelledby="due-h">
          <SectionHeader
            id="due-h"
            title="Binnenkort terugbrengen"
            to="/my/loans"
            toLabel="Alles"
          />
          <Shelf label="Binnenkort terugbrengen">
            {dueSoon.map((l) => (
              <ShelfBook
                key={l.id}
                book={
                  books[l.bookId] ?? { id: l.bookId, title: l.title, coverUrl: null, authors: [] }
                }
                caption={<>Vóór {dateNl(l.dueAt)}</>}
              />
            ))}
          </Shelf>
        </section>
      )}

      <div className="profile-grid">
        <section className="panel profile-section" aria-labelledby="gegevens-h">
          <h2 id="gegevens-h">Gegevens</h2>
          <form onSubmit={save}>
            <label className="field">
              <span>Naam</span>
              <input
                value={name}
                required
                autoComplete="name"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            {message && (
              <p role={message.error ? 'alert' : 'status'} className={message.error ? 'error' : ''}>
                {message.text}
              </p>
            )}
            <button type="submit">Naam opslaan</button>
          </form>
        </section>

        <section className="panel profile-section" aria-labelledby="voorkeur-h">
          <h2 id="voorkeur-h">Voorkeuren</h2>
          <label className="field">
            <span>Meldingen en e-mails in</span>
            <select
              value={user.locale}
              onChange={(e) => void setLocale(e.target.value as 'nl' | 'en')}
            >
              <option value="nl">Nederlands</option>
              <option value="en">English</option>
            </select>
          </label>
          <p className="meta">
            De weergave (licht, donker of automatisch) kies je onderaan elke pagina.
          </p>
        </section>
      </div>

      <section className="panel">
        <TwoFactor />
      </section>

      <details className="panel danger-zone">
        <summary>Privacy: je gegevens downloaden of je account verwijderen</summary>
        <h2>Mijn gegevens (AVG)</h2>
        <p>Download een kopie van al je persoonlijke gegevens als JSON-bestand.</p>
        <button className="secondary" onClick={() => void download()}>
          Gegevens downloaden
        </button>
        <DeleteAccount />
      </details>
    </>
  );
}
