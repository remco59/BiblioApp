import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { BookDetail, Reservation } from '@biblio/api-client';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { dateNl } from '../lib/format';
import { period, useRules } from '../lib/useRules';
import { Icon } from './Icon';

type Message = { text: string; error?: boolean };

/** Wat kan ik met dit boek? Altijd een volgende stap: ophalen, reserveren of je plek in de rij. */
export function ReserveBox({ book, onChange }: { book: BookDetail; onChange: () => void }) {
  const { user } = useAuth();
  const location = useLocation();
  const rules = useRules();
  const [mine, setMine] = useState<Reservation | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return setMine(null);
    const { data } = await api.GET('/api/me/reservations');
    setMine(data?.find((r) => r.bookId === book.id) ?? null);
  }, [user, book.id]);
  useEffect(() => {
    void load();
  }, [load, book.copiesAvailable, book.reservationsWaiting]);

  async function reserve() {
    setBusy(true);
    const { data, error } = await api.POST('/api/me/reservations', { body: { bookId: book.id } });
    setBusy(false);
    setMessage(
      error
        ? { text: errorMessage(error), error: true }
        : {
            text:
              data?.status === 'READY'
                ? 'Gereserveerd en direct klaargelegd.'
                : `Gereserveerd. Je bent nummer ${data?.position ?? ''} in de wachtrij; we sturen je een melding zodra het klaarligt.`,
          },
    );
    await load();
    onChange();
  }
  async function cancel() {
    if (!mine) return;
    setBusy(true);
    const { error } = await api.POST('/api/me/reservations/{id}/cancel', {
      params: { path: { id: mine.id } },
    });
    setBusy(false);
    setConfirming(false);
    setMessage(
      error ? { text: errorMessage(error), error: true } : { text: 'Reservering geannuleerd.' },
    );
    await load();
    onChange();
  }

  const feedback = message && (
    <p role={message.error ? 'alert' : 'status'} className={message.error ? 'error' : 'ok-note'}>
      {!message.error && <Icon name="check" />} {message.text}
    </p>
  );
  const cancelControls = confirming ? (
    <span className="confirm" role="group" aria-label="Annuleren bevestigen">
      <span>
        {mine?.status === 'READY'
          ? 'Het boek gaat dan naar de volgende in de rij.'
          : `Je verliest plek ${mine?.position} in de wachtrij.`}
      </span>
      <button className="danger-btn" disabled={busy} onClick={() => void cancel()}>
        Ja, annuleren
      </button>
      <button className="secondary" onClick={() => setConfirming(false)}>
        Behouden
      </button>
    </span>
  ) : (
    <button className="link danger" onClick={() => setConfirming(true)}>
      Reservering annuleren
    </button>
  );

  if (mine?.status === 'READY') {
    return (
      <div className="reserve ready">
        <p className="reserve-title">
          <Icon name="check" /> Je reservering ligt klaar
        </p>
        <p>
          Haal het op aan de balie tot en met{' '}
          <strong>{mine.expiresAt && dateNl(mine.expiresAt)}</strong>. Daarna gaat het naar de
          volgende in de rij.
        </p>
        {cancelControls}
        {feedback}
      </div>
    );
  }
  if (mine?.status === 'WAITING') {
    return (
      <div className="reserve">
        <p className="reserve-title">
          <Icon name="clock" /> Je staat op plek {mine.position} in de wachtrij
        </p>
        <p>
          We sturen je een melding zodra het voor je klaarligt
          {rules && <>; je hebt dan {period(rules.reservationHoldDays)} om het op te halen</>}.
        </p>
        {cancelControls}
        {feedback}
      </div>
    );
  }
  if (book.copiesTotal === 0) return null;

  if (book.copiesAvailable > 0) {
    return (
      <div className="reserve available">
        <p className="reserve-title">
          <Icon name="check" /> Staat in de kast
        </p>
        <p>
          Pak het uit de kast en laat het met je bibliotheekpas uitlenen aan de balie
          {rules && <>. Je leent het {period(rules.loanDays)}</>}.
        </p>
        {!user && (
          <p className="meta">
            Nog geen pas? <Link to="/register">Word lid</Link>, dan kun je meteen lenen.
          </p>
        )}
        {feedback}
      </div>
    );
  }

  const next = book.reservationsWaiting + 1;
  return (
    <div className="reserve">
      <p className="reserve-title">
        <Icon name="clock" /> Alle exemplaren zijn uitgeleend
      </p>
      <p>
        {book.reservationsWaiting === 0
          ? 'Er wacht nog niemand: reserveer en je bent als eerste aan de beurt.'
          : `${book.reservationsWaiting} ${book.reservationsWaiting === 1 ? 'lid wacht' : 'leden wachten'} al. Reserveer je nu, dan word je nummer ${next}.`}
      </p>
      {user ? (
        <button disabled={busy} onClick={() => void reserve()}>
          {busy ? 'Bezig…' : 'Reserveren'}
        </button>
      ) : (
        <p>
          <Link className="button" to="/login" state={{ from: location.pathname }}>
            Inloggen om te reserveren
          </Link>
        </p>
      )}
      {feedback}
    </div>
  );
}
