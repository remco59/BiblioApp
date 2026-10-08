import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MemberDetail, Reservation } from '@biblio/api-client';
import { api, errorMessage } from '../api';
import { useServerEvent } from '../lib/events';
import { FineTable } from '../components/FineTable';
import { LoanTable } from '../components/LoanTable';
import { dateNl, money } from '../lib/format';

export function MyLoansPage() {
  const [m, setM] = useState<MemberDetail | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.GET('/api/me/membership');
    setM(data ?? null);
    const r = await api.GET('/api/me/reservations');
    setReservations(r.data ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useServerEvent('availability', () => void load());
  useServerEvent('notification', () => void load());

  async function renew(id: number) {
    const { error } = await api.POST('/api/me/loans/{id}/renew', { params: { path: { id } } });
    setMessage(error ? { text: errorMessage(error), error: true } : { text: 'Verlengd' });
    void load();
  }

  async function cancel(id: number) {
    await api.POST('/api/me/reservations/{id}/cancel', { params: { path: { id } } });
    setMessage({ text: 'Reservering geannuleerd' });
    void load();
  }

  if (!m) return <p>Laden…</p>;
  return (
    <>
      <h1>Mijn uitleningen</h1>
      <p>
        Lidnummer <strong>{m.memberNumber}</strong> · lid tot {dateNl(m.membershipUntil)}
        {m.outstandingFinesCents > 0 && (
          <>
            {' '}
            · <span className="bad">openstaande boete {money(m.outstandingFinesCents)}</span>
          </>
        )}
      </p>
      {message && (
        <p role={message.error ? 'alert' : 'status'} className={message.error ? 'error' : ''}>
          {message.text}
        </p>
      )}
      <h2>Nu geleend</h2>
      <LoanTable
        loans={m.loans.filter((l) => !l.returnedAt)}
        actions={(l) => (
          <button className="link" disabled={!l.canRenew} onClick={() => void renew(l.id)}>
            Verlengen
          </button>
        )}
      />
      <h2>Reserveringen</h2>
      {reservations.length === 0 ? (
        <p>Geen actieve reserveringen.</p>
      ) : (
        <ul className="reservations">
          {reservations.map((r) => (
            <li key={r.id}>
              <Link to={`/books/${r.bookId}`}>{r.title}</Link> —{' '}
              {r.status === 'READY' ? (
                <strong className="ok">
                  klaar om op te halen tot en met {r.expiresAt && dateNl(r.expiresAt)}
                </strong>
              ) : (
                <>plek {r.position} in de wachtrij</>
              )}{' '}
              <button className="link danger" onClick={() => void cancel(r.id)}>
                Annuleren
              </button>
            </li>
          ))}
        </ul>
      )}
      <h2>Boetes</h2>
      <FineTable fines={m.fines} />
      <h2>Geschiedenis</h2>
      <LoanTable loans={m.loans.filter((l) => l.returnedAt)} />
    </>
  );
}
