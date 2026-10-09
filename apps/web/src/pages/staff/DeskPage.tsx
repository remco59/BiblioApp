import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Member, MemberDetail } from '@biblio/api-client';
import { api, errorMessage } from '../../api';
import { BarcodeInput } from '../../components/BarcodeInput';
import { Icon } from '../../components/Icon';
import { dateNl, money } from '../../lib/format';

interface LogEntry {
  id: number;
  ok: boolean;
  text: string;
}

interface Hold {
  id: number;
  title: string;
  memberName: string;
}

type Mode = 'checkout' | 'checkin';
const MODES: { id: Mode; label: string; key: string }[] = [
  { id: 'checkout', label: 'Uitlenen', key: 'u' },
  { id: 'checkin', label: 'Innemen', key: 'i' },
];

export function DeskPage() {
  const [mode, setMode] = useState<Mode>('checkout');
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [matches, setMatches] = useState<Member[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [condition, setCondition] = useState<'OK' | 'DAMAGED'>('OK');
  const tabs = useRef<Record<Mode, HTMLButtonElement | null>>({ checkout: null, checkin: null });

  const push = useCallback((ok: boolean, text: string) => {
    setLog((l) => [{ id: Date.now() + Math.random(), ok, text }, ...l].slice(0, 20));
  }, []);

  // Sneltoetsen: Alt+U = uitlenen, Alt+I = innemen (ook terwijl de focus in een scanveld staat).
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const hit = MODES.find((m) => m.key === e.key.toLowerCase());
      if (!hit) return;
      e.preventDefault();
      setMode(hit.id);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openMember = useCallback(async (id: number) => {
    const detail = await api.GET('/api/staff/members/{id}', { params: { path: { id } } });
    if (detail.data) {
      setMember(detail.data);
      setMatches([]);
    }
  }, []);

  const loadMember = useCallback(
    async (q: string) => {
      const { data } = await api.GET('/api/staff/members', { params: { query: { q } } });
      const exact = data?.find((m) => m.memberNumber.toLowerCase() === q.toLowerCase());
      const one = exact ?? (data?.length === 1 ? data[0] : undefined);
      if (one) return openMember(one.id);
      if (data && data.length > 1) {
        setMember(null);
        return setMatches(data.slice(0, 8));
      }
      setMatches([]);
      push(false, `Geen lid gevonden voor “${q}”. Controleer het lidnummer of zoek op naam.`);
    },
    [push, openMember],
  );

  const refresh = useCallback(async () => {
    if (!member) return;
    const { data } = await api.GET('/api/staff/members/{id}', {
      params: { path: { id: member.id } },
    });
    if (data) setMember(data);
  }, [member]);

  const scanCopy = useCallback(
    async (barcode: string) => {
      if (mode === 'checkout') {
        if (!member) return push(false, 'Zoek eerst het lid op (scan de bibliotheekpas).');
        const { data, error } = await api.POST('/api/staff/loans/checkout', {
          body: { memberNumber: member.memberNumber, barcode },
        });
        if (data) push(true, `Uitgeleend: “${data.title}” tot ${dateNl(data.dueAt)}`);
        else push(false, errorMessage(error));
        await refresh();
      } else {
        const { data, error } = await api.POST('/api/staff/loans/checkin', {
          body: { barcode, condition },
        });
        if (data) {
          const fine = data.fine
            ? ` · boete ${money(data.fine.amountCents)} voor ${data.loan.memberName}`
            : '';
          push(
            true,
            `Ingenomen: “${data.loan.title}” (${data.loan.memberName})${data.daysLate ? `, ${data.daysLate} ${data.daysLate === 1 ? 'dag' : 'dagen'} te laat` : ''}${fine}`,
          );
          if (data.reservedFor) {
            const reservedFor = data.reservedFor;
            setHolds((h) => [
              { id: Date.now(), title: data.loan.title, memberName: reservedFor },
              ...h,
            ]);
          }
        } else push(false, errorMessage(error));
        await refresh();
      }
    },
    [mode, member, condition, push, refresh],
  );

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next: Mode = mode === 'checkout' ? 'checkin' : 'checkout';
    setMode(next);
    tabs.current[next]?.focus();
  }

  return (
    <>
      <div className="desk-head">
        <h1>Balie</h1>
        <p className="meta">
          Sneltoetsen: <kbd>Alt</kbd>+<kbd>U</kbd> uitlenen, <kbd>Alt</kbd>+<kbd>I</kbd> innemen
        </p>
      </div>

      {holds.length > 0 && (
        <section className="hold-alerts" aria-label="Apart leggen">
          {holds.map((h) => (
            <div key={h.id} className="hold-alert" role="alert">
              <Icon name="alert" />
              <p>
                <strong>Leg apart:</strong> “{h.title}” is gereserveerd voor {h.memberName}. Zet het
                op de afhaalplank.
              </p>
              <button
                className="secondary small"
                onClick={() => setHolds((all) => all.filter((x) => x.id !== h.id))}
              >
                Gedaan
              </button>
            </div>
          ))}
        </section>
      )}

      <div role="tablist" aria-label="Actie" className="segmented">
        {MODES.map((m) => (
          <button
            key={m.id}
            ref={(el) => {
              tabs.current[m.id] = el;
            }}
            role="tab"
            id={`tab-${m.id}`}
            aria-controls="desk-panel"
            aria-selected={mode === m.id}
            tabIndex={mode === m.id ? 0 : -1}
            onClick={() => setMode(m.id)}
            onKeyDown={onTabKey}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="desk-panel" aria-labelledby={`tab-${mode}`} className="desk-panel">
        {mode === 'checkout' && (
          <section aria-label="Lid">
            {!member && (
              <BarcodeInput
                label="Lidnummer, naam of e-mail"
                action="Lid zoeken"
                onScan={loadMember}
                autoFocus={!member}
              />
            )}
            {matches.length > 0 && (
              <div className="matches">
                <p>
                  <strong>{matches.length} leden gevonden.</strong> Kies het juiste lid:
                </p>
                <ul>
                  {matches.map((m) => (
                    <li key={m.id}>
                      <button className="link tap" onClick={() => void openMember(m.id)}>
                        {m.name}
                      </button>{' '}
                      <span className="meta">
                        {m.memberNumber} · {m.email}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {member && (
              <div className="member-card" aria-live="polite">
                <div className="member-card-head">
                  <h2>
                    <Link to={`/staff/members/${member.id}`}>{member.name}</Link>{' '}
                    <small>{member.memberNumber}</small>
                  </h2>
                  <button className="secondary small" onClick={() => setMember(null)}>
                    Volgend lid
                  </button>
                </div>
                <ul className="badges">
                  <li>{member.activeLoans} uitgeleend</li>
                  {member.overdueLoans > 0 && (
                    <li className="bad">{member.overdueLoans} te laat</li>
                  )}
                  {member.outstandingFinesCents > 0 && (
                    <li className="bad">Boete {money(member.outstandingFinesCents)}</li>
                  )}
                  {member.blocked && <li className="bad">Geblokkeerd</li>}
                  {!member.membershipValid && <li className="bad">Lidmaatschap verlopen</li>}
                </ul>
              </div>
            )}
          </section>
        )}

        {mode === 'checkin' && (
          <label className="check">
            <input
              type="checkbox"
              checked={condition === 'DAMAGED'}
              onChange={(e) => setCondition(e.target.checked ? 'DAMAGED' : 'OK')}
            />
            Exemplaar is beschadigd
          </label>
        )}

        {(mode === 'checkin' || member) && (
          <section aria-label="Exemplaar">
            <BarcodeInput
              label={mode === 'checkout' ? 'Scan exemplaar (barcode)' : 'Scan ingeleverd exemplaar'}
              action={mode === 'checkout' ? 'Uitlenen' : 'Innemen'}
              onScan={scanCopy}
              autoFocus={mode === 'checkin' || !!member}
            />
          </section>
        )}
      </div>

      <h2>Verwerkt</h2>
      <ul className="log" aria-live="polite">
        {log.length === 0 && <li className="meta">Nog niets gescand in deze sessie.</li>}
        {log.map((e) => (
          <li key={e.id} className={e.ok ? 'ok' : 'bad'}>
            <Icon name={e.ok ? 'check' : 'alert'} /> {e.text}
          </li>
        ))}
      </ul>
    </>
  );
}
