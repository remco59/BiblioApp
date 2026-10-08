import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Review, Suggestion } from '@biblio/api-client';
import { api } from '../../api';
import { Stars } from '../../components/Stars';
import { dateNl } from '../../lib/format';
import { SUGGESTION_STATUS } from '../SuggestionsPage';

const NEXT = ['APPROVED', 'ORDERED', 'ADDED', 'REJECTED'] as const;

export function ModerationPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const load = useCallback(async () => {
    const [r, s] = await Promise.all([
      api.GET('/api/staff/reviews'),
      api.GET('/api/staff/suggestions'),
    ]);
    setReviews(r.data ?? []);
    setSuggestions(
      (s.data ?? []).filter(
        (x) => x.status === 'SUBMITTED' || x.status === 'APPROVED' || x.status === 'ORDERED',
      ),
    );
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function moderate(r: Review, status: 'APPROVED' | 'REJECTED') {
    const note =
      status === 'REJECTED'
        ? (window.prompt('Reden van afwijzing (zichtbaar voor het lid)') ?? undefined)
        : undefined;
    await api.POST('/api/staff/reviews/{id}/moderate', {
      params: { path: { id: r.id } },
      body: { status, note },
    });
    void load();
  }
  async function handle(s: Suggestion, status: (typeof NEXT)[number]) {
    const note = window.prompt('Opmerking voor het lid (optioneel)') ?? undefined;
    await api.PATCH('/api/staff/suggestions/{id}', {
      params: { path: { id: s.id } },
      body: { status, note },
    });
    void load();
  }

  return (
    <>
      <h1>Reviews en suggesties</h1>
      <h2>Reviews ter goedkeuring ({reviews.length})</h2>
      {reviews.length === 0 ? (
        <p>Geen reviews in de wachtrij.</p>
      ) : (
        <ul className="reviews">
          {reviews.map((r) => (
            <li key={r.id}>
              <p>
                <Link to={`/books/${r.bookId}`}>{r.bookTitle}</Link> — <strong>{r.author}</strong>{' '}
                <span className="meta">{dateNl(r.createdAt)}</span>
              </p>
              <p>
                <Stars value={r.rating} />
              </p>
              {r.body && <blockquote>{r.body}</blockquote>}
              <button onClick={() => void moderate(r, 'APPROVED')}>Goedkeuren</button>{' '}
              <button className="secondary" onClick={() => void moderate(r, 'REJECTED')}>
                Afwijzen
              </button>
            </li>
          ))}
        </ul>
      )}
      <h2>Aankoopsuggesties ({suggestions.length})</h2>
      {suggestions.length === 0 ? (
        <p>Geen openstaande suggesties.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Titel</th>
                <th scope="col">Auteur</th>
                <th scope="col">Lid</th>
                <th scope="col">Reden</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Acties</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((s) => (
                <tr key={s.id}>
                  <td>{s.title}</td>
                  <td>{s.author}</td>
                  <td>{s.memberName}</td>
                  <td>{s.reason ?? '—'}</td>
                  <td>{SUGGESTION_STATUS[s.status]}</td>
                  <td>
                    {NEXT.filter((n) => n !== s.status).map((n) => (
                      <button key={n} className="link" onClick={() => void handle(s, n)}>
                        {SUGGESTION_STATUS[n]}
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
