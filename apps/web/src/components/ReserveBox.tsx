import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BookDetail, Reservation } from '@biblio/api-client';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { dateNl } from '../lib/format';

export function ReserveBox({ book, onChange }: { book: BookDetail; onChange: () => void }) {
  const { user } = useAuth();
  const [mine, setMine] = useState<Reservation | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!user) return setMine(null);
    const { data } = await api.GET('/api/me/reservations');
    setMine(data?.find((r) => r.bookId === book.id) ?? null);
  }, [user, book.id]);
  useEffect(() => {
    void load();
  }, [load, book.copiesAvailable, book.reservationsWaiting]);

  async function reserve() {
    const { error } = await api.POST('/api/me/reservations', { body: { bookId: book.id } });
    setMessage(error ? { text: errorMessage(error), error: true } : { text: 'Gereserveerd' });
    await load();
    onChange();
  }
  async function cancel() {
    if (!mine) return;
    await api.POST('/api/me/reservations/{id}/cancel', { params: { path: { id: mine.id } } });
    setMessage({ text: 'Reservering geannuleerd' });
    await load();
    onChange();
  }

  if (mine?.status === 'READY') {
    return (
      <div className="reserve ready" role="status">
        <strong>Je reservering ligt klaar!</strong> Ophalen aan de balie tot en met{' '}
        {mine.expiresAt && dateNl(mine.expiresAt)}.{' '}
        <button className="link" onClick={() => void cancel()}>
          Annuleren
        </button>
      </div>
    );
  }
  if (mine?.status === 'WAITING') {
    return (
      <div className="reserve" role="status">
        Je staat op plek <strong>{mine.position}</strong> in de wachtrij.{' '}
        <button className="link" onClick={() => void cancel()}>
          Reservering annuleren
        </button>
        {message && <span className="sr-only">{message.text}</span>}
      </div>
    );
  }
  if (book.copiesAvailable > 0 || book.copiesTotal === 0) return null;
  return (
    <div className="reserve">
      {book.reservationsWaiting > 0 && (
        <p>
          {book.reservationsWaiting}{' '}
          {book.reservationsWaiting === 1 ? 'lid wacht' : 'leden wachten'} al op dit boek.
        </p>
      )}
      {user ? (
        <button onClick={() => void reserve()}>Reserveren</button>
      ) : (
        <p>
          <Link to="/login">Log in</Link> om dit boek te reserveren.
        </p>
      )}
      {message && (
        <p role={message.error ? 'alert' : 'status'} className={message.error ? 'error' : ''}>
          {message.text}
        </p>
      )}
    </div>
  );
}
