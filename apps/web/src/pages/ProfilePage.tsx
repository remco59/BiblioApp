import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';

export function ProfilePage() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [message, setMessage] = useState<string | null>(null);

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
    <section className="card">
      <h1>Mijn profiel</h1>
      <dl>
        <dt>E-mailadres</dt>
        <dd>{user.email}</dd>
        <dt>Lidnummer</dt>
        <dd>{user.memberNumber ?? '—'}</dd>
        <dt>Rol</dt>
        <dd>{user.role}</dd>
      </dl>
      <form onSubmit={save}>
        <label className="field">
          <span>Naam</span>
          <input value={name} required onChange={(e) => setName(e.target.value)} />
        </label>
        {message && <p role="status">{message}</p>}
        <button type="submit">Opslaan</button>
      </form>
      <h2>Taal van meldingen</h2>
      <label className="field">
        <span>Meldingen en e-mails in</span>
        <select value={user.locale} onChange={(e) => void setLocale(e.target.value as 'nl' | 'en')}>
          <option value="nl">Nederlands</option>
          <option value="en">English</option>
        </select>
      </label>
      <h2>Mijn gegevens (AVG)</h2>
      <p>Download een kopie van al je persoonlijke gegevens.</p>
      <button onClick={download}>Gegevens exporteren</button>
    </section>
  );
}
