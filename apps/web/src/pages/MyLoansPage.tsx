import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Loan, MemberDetail, Reservation } from '@biblio/api-client';
import { api, errorMessage } from '../api';
import { useServerEvent } from '../lib/events';
import { FineTable } from '../components/FineTable';
import { LibraryTabs } from '../components/LibraryTabs';
import { LoadError, Loading } from '../components/LoadState';
import { LoanRules } from '../components/LoanRules';
import { LoanTable } from '../components/LoanTable';
import { Icon } from '../components/Icon';
import { dateNl, money } from '../lib/format';
import { useBooks } from '../lib/useBooks';
import { useRules } from '../lib/useRules';
import { SectionHeader, Shelf, ShelfBook, StatusPill } from '../components/Shelf';

type Message = { text: string; error?: boolean };

export function MyLoansPage() {
  const rules = useRules();
  const [params, setParams] = useSearchParams();
  const [m, setM] = useState<MemberDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [confirmCancel, setConfirmCancel] = useState<number | null>(null);
  const [view, setView] = useState<'shelf' | 'list'>(() => {
    try {
      return localStorage.getItem('libraryView') === 'list' ? 'list' : 'shelf';
    } catch {
      return 'shelf';
    }
  });
  const [message, setMessage] = useState<Message | null>(null);
  const paymentReturn = params.get('betaling');

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [mem, r] = await Promise.all([
        api.GET('/api/me/membership'),
        api.GET('/api/me/reservations'),
      ]);
      if (!mem.data) return setFailed(true);
      setM(mem.data);
      setReservations(r.data ?? []);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useServerEvent('availability', () => void load());
  useServerEvent('notification', () => void load());

  // Terug van de betaalpagina: zeg wat er met de boete is gebeurd.
  useEffect(() => {
    if (!paymentReturn || !m) return;
    const fine = m.fines.find((f) => String(f.id) === paymentReturn);
    setMessage(
      fine && fine.status === 'OPEN'
        ? {
            text: `De betaling is niet gelukt; er staat nog ${money(fine.outstandingCents)} open. Je kunt het opnieuw proberen of aan de balie betalen.`,
            error: true,
          }
        : { text: 'Bedankt, je boete is betaald.' },
    );
    const next = new URLSearchParams(params);
    next.delete('betaling');
    setParams(next, { replace: true });
  }, [paymentReturn, m, params, setParams]);

  async function renew(l: Loan) {
    const { data, error } = await api.POST('/api/me/loans/{id}/renew', {
      params: { path: { id: l.id } },
    });
    setMessage(
      error
        ? { text: errorMessage(error), error: true }
        : { text: `“${l.title}” is verlengd tot ${data ? dateNl(data.dueAt) : 'later'}.` },
    );
    void load();
  }

  async function payOnline(fineId: number) {
    const { data, error } = await api.POST('/api/me/fines/{id}/pay-online', {
      params: { path: { id: fineId } },
    });
    if (data) window.location.href = data.checkoutUrl;
    else setMessage({ text: errorMessage(error), error: true });
  }

  async function cancel(r: Reservation) {
    const { error } = await api.POST('/api/me/reservations/{id}/cancel', {
      params: { path: { id: r.id } },
    });
    setConfirmCancel(null);
    setMessage(
      error
        ? { text: errorMessage(error), error: true }
        : { text: `Reservering voor “${r.title}” geannuleerd.` },
    );
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

  /** Verlengen, of de reden waarom het niet kan. */
  function renewControl(l: Loan) {
    if (l.canRenew)
      return (
        <button className="link tap" onClick={() => void renew(l)}>
          Verlengen
        </button>
      );
    const reason = l.overdue
      ? 'Te laat: breng het eerst terug'
      : rules && l.renewals >= rules.maxRenewals
        ? `Al ${l.renewals}× verlengd`
        : 'Verlengen kan niet: een ander lid wacht erop';
    return <span className="meta">{reason}</span>;
  }

  function cancelControl(r: Reservation) {
    if (confirmCancel !== r.id)
      return (
        <button className="link danger tap" onClick={() => setConfirmCancel(r.id)}>
          Annuleren
        </button>
      );
    return (
      <span className="confirm" role="group" aria-label={`Annuleren van ${r.title} bevestigen`}>
        <span>
          {r.status === 'READY'
            ? 'Het boek gaat naar de volgende in de rij.'
            : `Je verliest plek ${r.position}.`}
        </span>
        <button className="danger-btn" onClick={() => void cancel(r)}>
          Ja, annuleren
        </button>
        <button className="secondary" onClick={() => setConfirmCancel(null)}>
          Behouden
        </button>
      </span>
    );
  }

  if (failed && !m) return <LoadError what="Je bibliotheek" onRetry={() => void load()} />;
  if (!m) return <Loading label="Je bibliotheek laden…" />;
  const stub = (id: number, title: string) =>
    books[id] ?? { id, title, coverUrl: null, authors: [] };
  const history = m.loans.filter((l) => l.returnedAt);
  const openFines = m.fines.filter((f) => f.status === 'OPEN');
  return (
    <>
      <div className="library-head">
        <h1>Mijn bibliotheek</h1>
        <div className="view-toggle" role="group" aria-label="Weergave">
          <button type="button" aria-pressed={view === 'shelf'} onClick={() => chooseView('shelf')}>
            Plank
          </button>
          <button type="button" aria-pressed={view === 'list'} onClick={() => chooseView('list')}>
            Lijst
          </button>
        </div>
      </div>
      <LibraryTabs />
      <p className="lede">
        Lidnummer <strong>{m.memberNumber}</strong> · lid tot {dateNl(m.membershipUntil)}
      </p>
      {message && (
        <p
          role={message.error ? 'alert' : 'status'}
          className={message.error ? 'notice error' : 'notice ok-note'}
        >
          <Icon name={message.error ? 'alert' : 'check'} /> {message.text}
        </p>
      )}
      {m.outstandingFinesCents > 0 && (
        <p className="notice warn-note">
          <Icon name="alert" /> Je hebt {money(m.outstandingFinesCents)} aan openstaande boetes.{' '}
          <a href="#fines-h">Bekijken en betalen</a>
        </p>
      )}

      <SectionHeader id="borrowed-h" title="Nu geleend" />
      {active.length === 0 ? (
        <p className="empty">
          Je hebt nu niets geleend. <Link to="/catalogus">Zoek iets om te lezen</Link>.
        </p>
      ) : view === 'list' ? (
        <LoanTable loans={active} actions={renewControl} />
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
              <span className="shelf-actions">{renewControl(l)}</span>
            </ShelfBook>
          ))}
        </Shelf>
      )}

      <SectionHeader id="reserved-h" title="Reserveringen" />
      {reservations.length === 0 ? (
        <p className="empty">
          Geen reserveringen. Is een boek uitgeleend? Reserveer het op de pagina van het boek.
        </p>
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
              {cancelControl(r)}
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
                    Ophalen t/m {r.expiresAt && dateNl(r.expiresAt)}
                  </StatusPill>
                ) : (
                  <StatusPill tone="warn">Plek {r.position} in de wachtrij</StatusPill>
                )
              }
            >
              <span className="shelf-actions">{cancelControl(r)}</span>
            </ShelfBook>
          ))}
        </Shelf>
      )}

      {m.fines.length > 0 && (
        <>
          <h2 id="fines-h">Boetes</h2>
          <FineTable
            fines={openFines.length > 0 ? openFines : m.fines.slice(0, 5)}
            actions={(f) => (
              <button className="small" onClick={() => void payOnline(f.id)}>
                Betaal {money(f.outstandingCents)}
              </button>
            )}
          />
          {openFines.length > 0 && (
            <p className="meta">
              Je gaat naar een beveiligde betaalpagina en komt daarna hier terug. Liever contant of
              met pin? Dat kan ook aan de balie.
            </p>
          )}
        </>
      )}

      {history.length > 0 && (
        <details className="history">
          <summary>Eerder geleend ({Math.min(history.length, 10)})</summary>
          <LoanTable loans={history.slice(0, 10)} />
        </details>
      )}

      <LoanRules />
    </>
  );
}
