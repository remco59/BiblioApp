import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Suggestion } from '@biblio/api-client';
import { api, errorMessage } from '../api';
import { dateNl } from '../lib/format';

export const SUGGESTION_STATUS: Record<string, string> = {
  SUBMITTED: 'Ingediend',
  APPROVED: 'Goedgekeurd',
  REJECTED: 'Afgewezen',
  ORDERED: 'Besteld',
  ADDED: 'Toegevoegd aan de collectie',
};

export function SuggestionsPage() {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [form, setForm] = useState({ title: '', author: '', isbn: '', reason: '' });
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.GET('/api/me/suggestions');
    setItems(data ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { error } = await api.POST('/api/me/suggestions', {
      body: {
        title: form.title,
        author: form.author,
        isbn: form.isbn || undefined,
        reason: form.reason || undefined,
      },
    });
    if (error) return setMessage({ text: errorMessage(error), error: true });
    setForm({ title: '', author: '', isbn: '', reason: '' });
    setMessage({ text: 'Bedankt voor je suggestie!' });
    void load();
  }
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <h1>Aankoopsuggesties</h1>
      <p>Mis je een boek in de collectie? Laat het ons weten.</p>
      <form onSubmit={submit} className="book-form">
        <label className="field">
          <span>Titel *</span>
          <input value={form.title} onChange={set('title')} required />
        </label>
        <label className="field">
          <span>Auteur *</span>
          <input value={form.author} onChange={set('author')} required />
        </label>
        <label className="field">
          <span>ISBN (optioneel)</span>
          <input value={form.isbn} onChange={set('isbn')} />
        </label>
        <label className="field">
          <span>Waarom zou dit boek in de bibliotheek moeten staan?</span>
          <textarea value={form.reason} onChange={set('reason')} rows={3} />
        </label>
        {message && (
          <p role={message.error ? 'alert' : 'status'} className={message.error ? 'error' : ''}>
            {message.text}
          </p>
        )}
        <button type="submit">Suggestie indienen</button>
      </form>
      <h2>Mijn suggesties</h2>
      {items.length === 0 ? (
        <p>Je hebt nog niets voorgesteld.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Titel</th>
                <th scope="col">Auteur</th>
                <th scope="col">Datum</th>
                <th scope="col">Status</th>
                <th scope="col">Opmerking</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td>{s.title}</td>
                  <td>{s.author}</td>
                  <td>{dateNl(s.createdAt)}</td>
                  <td>{SUGGESTION_STATUS[s.status]}</td>
                  <td>{s.staffNote ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
