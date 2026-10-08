import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { BookReviews } from '@biblio/api-client';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { dateNl } from '../lib/format';
import { StarInput, Stars } from './Stars';

const STATUS: Record<string, string> = { PENDING: 'wacht op goedkeuring', REJECTED: 'afgewezen' };

export function Reviews({ bookId }: { bookId: number }) {
  const { user } = useAuth();
  const [data, setData] = useState<BookReviews | null>(null);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    const res = await api.GET('/api/books/{id}/reviews', { params: { path: { id: bookId } } });
    if (res.data) {
      setData(res.data);
      if (res.data.mine) {
        setRating(res.data.mine.rating);
        setBody(res.data.mine.body ?? '');
      }
    }
  }, [bookId]);
  useEffect(() => {
    void load();
  }, [load, user?.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { error } = await api.POST('/api/me/reviews', {
      body: { bookId, rating, body: body || undefined },
    });
    setMessage(
      error
        ? { text: errorMessage(error), error: true }
        : { text: 'Bedankt! Je review wordt eerst beoordeeld door een medewerker.' },
    );
    void load();
  }
  async function remove() {
    await api.DELETE('/api/me/reviews/{bookId}', { params: { path: { bookId } } });
    setBody('');
    setMessage({ text: 'Review verwijderd' });
    void load();
  }

  if (!data) return null;
  return (
    <section aria-labelledby="reviews-h">
      <h2 id="reviews-h">Reviews</h2>
      <p>
        <Stars value={data.summary.average} count={data.summary.count} />
      </p>
      {data.items.length === 0 && <p>Er zijn nog geen reviews.</p>}
      <ul className="reviews">
        {data.items.map((r) => (
          <li key={r.id}>
            <p>
              <Stars value={r.rating} /> <strong>{r.author}</strong>{' '}
              <span className="meta">· {dateNl(r.createdAt)}</span>
            </p>
            {r.body && <p>{r.body}</p>}
          </li>
        ))}
      </ul>
      {data.mine && data.mine.status !== 'APPROVED' && (
        <p role="status" className="meta">
          Jouw review is {STATUS[data.mine.status]}.
          {data.mine.moderationNote && ` Reden: ${data.mine.moderationNote}`}
        </p>
      )}
      {data.canReview && (
        <form onSubmit={submit} className="review-form">
          <h3>{data.mine ? 'Je review aanpassen' : 'Schrijf een review'}</h3>
          <StarInput value={rating} onChange={setRating} />
          <label className="field">
            <span>Toelichting (optioneel)</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              maxLength={2000}
            />
          </label>
          {message && (
            <p role={message.error ? 'alert' : 'status'} className={message.error ? 'error' : ''}>
              {message.text}
            </p>
          )}
          <button type="submit">Plaatsen</button>{' '}
          {data.mine && (
            <button type="button" className="secondary" onClick={() => void remove()}>
              Verwijderen
            </button>
          )}
        </form>
      )}
      {!user && (
        <p className="meta">Log in om een review te schrijven nadat je het boek hebt geleend.</p>
      )}
    </section>
  );
}
