import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { MemberDetail } from '@biblio/api-client';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { DeleteAccount } from '../components/DeleteAccount';
import { TwoFactor } from '../components/TwoFactor';
import { ThemeToggle } from '../components/ThemeToggle';
import { SectionHeader, Shelf, ShelfBook } from '../components/Shelf';
import { dateNl } from '../lib/format';
import { useBooks } from '../lib/useBooks';

export function ProfilePage() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [m, setM] = useState<MemberDetail | null>(null);
  useEffect(() => {
    if (!user?.memberNumber) return;
    api.GET('/api/me/membership').then(({ data }) => setM(data ?? null));
  }, [user?.memberNumber]);
  const active = m?.loans.filter((l) => !l.returnedAt) ?? [];
  const dueSoon = active
    .filter((l) => new Date(l.dueAt).getTime() - Date.now() < 5 * 86_400_000)
    .slice(0, 4);
  const books = useBooks(dueSoon.map((l) => l.bookId));

  async function save(e: FormEvent) {
    e.preventDefault();
    const { error } = await api.PATCH('/api/users/me', { body: { name } });
    if (error) return setMessage(errorMessage(error));
    if (user) setUser({ ...user, name });
    setMessage('Opgeslagen');
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
      <p className="kicker">Account</p>
      <h1>Mijn profiel</h1>

      <div className="profile-grid">
        <section className="panel profile-section" aria-labelledby="card-h">
          <h2 id="card-h" className="sr-only">
            Lidmaatschap
          </h2>
          <div className="library-card">
            <span>Bibliotheekpas</span>
            <span className="number">{user.memberNumber ?? '—'}</span>
            <span>{user.name}</span>
            {m && <span>Lid tot {dateNl(m.membershipUntil)}</span>}
          </div>
          <dl>
            <dt>E-mailadres</dt>
            <dd>{user.email}</dd>
            <dt>Lidnummer</dt>
            <dd>{user.memberNumber ?? '—'}</dd>
            <dt>Rol</dt>
            <dd>{user.role}</dd>
          </dl>
        </section>

        {m && (
          <section aria-labelledby="sum-h" className="profile-section">
            <h2 id="sum-h" className="sr-only">
              Overzicht
            </h2>
            <ul className="summary">
              <li>
                <strong>{active.length}</strong> geleend
              </li>
              <li>
                <strong>{dueSoon.length}</strong> binnenkort terug
              </li>
              <li>
                <strong>{active.filter((l) => l.overdue).length}</strong> te laat
              </li>
            </ul>
            <p>
              <Link to="/my/loans">Naar mijn bibliotheek →</Link>
            </p>
          </section>
        )}
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
          <h2 id="gegevens-h" style={{ marginTop: 0 }}>
            Gegevens
          </h2>
          <form onSubmit={save}>
            <label className="field">
              <span>Naam</span>
              <input value={name} required onChange={(e) => setName(e.target.value)} />
            </label>
            {message && <p role="status">{message}</p>}
            <button type="submit">Opslaan</button>
          </form>
        </section>

        <section className="panel profile-section" aria-labelledby="voorkeur-h">
          <h2 id="voorkeur-h" style={{ marginTop: 0 }}>
            Voorkeuren
          </h2>
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
          <p>
            Weergave: <ThemeToggle />
          </p>
        </section>
      </div>

      <section className="panel">
        <TwoFactor />
      </section>
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Mijn gegevens (AVG)</h2>
        <p>Download een kopie van al je persoonlijke gegevens.</p>
        <button onClick={download}>Gegevens exporteren</button>
        <DeleteAccount />
      </section>
    </>
  );
}
