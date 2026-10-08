import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MemberDetail, Reservation } from '@biblio/api-client';
import { api, errorMessage } from '../api';
import { useServerEvent } from '../lib/events';
import { FineTable } from '../components/FineTable';
import { LoanTable } from '../components/LoanTable';
import { dateNl, money } from '../lib/format';
import { useBooks } from '../lib/useBooks';
import { SectionHeader, Shelf, ShelfBook, StatusPill } from '../components/Shelf';
import type { Book } from '@biblio/api-client';

export function MyLoansPage() {
  const [m, setM] = useState<MemberDetail | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [wishlist, setWishlist] = useState<Book[]>([]);
  const [view, setView] = useState<'shelf' | 'list'>(() => {
    try {
      return localStorage.getItem('libraryView') === 'list' ? 'list' : 'shelf';
    } catch {
      return 'shelf';
    }
  });
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.GET('/api/me/membership');
    setM(data ?? null);
    const r = await api.GET('/api/me/reservations');
    setReservations(r.data ?? []);
    const w = await api.GET('/api/me/wishlist');
    setWishlist(w.data ?? []);
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

  async function payOnline(fineId: number) {
    const { data, error } = await api.POST('/api/me/fines/{id}/pay-online', {
      params: { path: { id: fineId } },
    });
    if (data) window.location.href = data.checkoutUrl;
    else setMessage({ text: errorMessage(error), error: true });
  }

  async function cancel(id: number) {
    await api.POST('/api/me/reservations/{id}/cancel', { params: { path: { id } } });
    setMessage({ text: 'Reservering geannuleerd' });
    void load();
  }

  const active = m?.loans.filter((l) => !l.returnedAt) ?? [];
  const books = useBooks([...active.map((l) => l.bookId), ...reservations.map((r) => r.bookId)]);
  function chooseView(v: 'shelf' | 'list') {
    setView(v);
    try {
      localStorage.setItem('libraryView', v);
    } catch {
      /* opslag niet beschikbaar */
    }
  }

  if (!m) return <p>Laden…</p>;
  const stub = (id: number, title: string) =>
    books[id] ?? { id, title, coverUrl: null, authors: [] };
  return (
    <>
      <div className="library-head">
        <div>
          <p className="kicker">Mijn bibliotheek</p>
          <h1>Mijn uitleningen</h1>
        </div>
        <div className="view-toggle" role="group" aria-label="Weergave">
          <button type="button" aria-pressed={view === 'shelf'} onClick={() => chooseView('shelf')}>
            Plank
          </button>
          <button type="button" aria-pressed={view === 'list'} onClick={() => chooseView('list')}>
            Lijst
          </button>
        </div>
      </div>
      <p className="lede">
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

      <SectionHeader id="borrowed-h" title="Nu geleend" />
      {view === 'list' ? (
        <LoanTable
          loans={active}
          actions={(l) => (
            <button className="link" disabled={!l.canRenew} onClick={() => void renew(l.id)}>
              Verlengen
            </button>
          )}
        />
      ) : active.length === 0 ? (
        <p className="empty">Je hebt nu niets geleend.</p>
      ) : (
        <Shelf label="Nu geleend">
          {active.map((l) => (
            <ShelfBook
              key={l.id}
              book={stub(l.bookId, l.title)}
              caption={
                l.overdue ? (
                  <StatusPill tone="bad">Te laat sinds {dateNl(l.dueAt)}</StatusPill>
                ) : (
                  <>Terugbrengen vóór {dateNl(l.dueAt)}</>
                )
              }
            >
              <span className="shelf-actions">
                <button className="link" disabled={!l.canRenew} onClick={() => void renew(l.id)}>
                  Verlengen
                </button>
              </span>
            </ShelfBook>
          ))}
        </Shelf>
      )}

      <SectionHeader id="reserved-h" title="Reserveringen" />
      {reservations.length === 0 ? (
        <p className="empty">Geen actieve reserveringen.</p>
      ) : view === 'list' ? (
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
      ) : (
        <Shelf label="Reserveringen">
          {reservations.map((r) => (
            <ShelfBook
              key={r.id}
              book={stub(r.bookId, r.title)}
              caption={
                r.status === 'READY' ? (
                  <StatusPill tone="ok">
                    Klaar tot en met {r.expiresAt && dateNl(r.expiresAt)}
                  </StatusPill>
                ) : (
                  <StatusPill tone="warn">Plek {r.position} in de wachtrij</StatusPill>
                )
              }
            >
              <span className="shelf-actions">
                <button className="link danger" onClick={() => void cancel(r.id)}>
                  Annuleren
                </button>
              </span>
            </ShelfBook>
          ))}
        </Shelf>
      )}

      <SectionHeader id="wish-h" title="Verlanglijst" to="/my/wishlist" toLabel="Beheren" />
      {wishlist.length === 0 ? (
        <p className="empty">
          Je verlanglijst is leeg. <Link to="/catalogus">Zoek een boek</Link> om te bewaren.
        </p>
      ) : (
        <Shelf label="Verlanglijst">
          {wishlist.slice(0, 6).map((b) => (
            <ShelfBook
              key={b.id}
              book={b}
              caption={
                b.copiesAvailable > 0 ? (
                  <StatusPill tone="ok">Beschikbaar</StatusPill>
                ) : (
                  <StatusPill tone="neutral">Uitgeleend</StatusPill>
                )
              }
            />
          ))}
        </Shelf>
      )}

      <h2>Boetes</h2>
      <FineTable
        fines={m.fines}
        actions={(f) => (
          <button className="link" onClick={() => void payOnline(f.id)}>
            Online betalen
          </button>
        )}
      />
      <h2>Geschiedenis</h2>
      <LoanTable loans={m.loans.filter((l) => l.returnedAt).slice(0, 10)} />
    </>
  );
}
