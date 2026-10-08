import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MemberDetail } from '@biblio/api-client';
import { api, errorMessage } from '../../api';
import { BarcodeInput } from '../../components/BarcodeInput';
import { dateNl, money } from '../../lib/format';

interface LogEntry {
  id: number;
  ok: boolean;
  text: string;
}

type Mode = 'checkout' | 'checkin';

export function DeskPage() {
  const [mode, setMode] = useState<Mode>('checkout');
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [condition, setCondition] = useState<'OK' | 'DAMAGED'>('OK');

  const push = useCallback((ok: boolean, text: string) => {
    setLog((l) => [{ id: Date.now() + Math.random(), ok, text }, ...l].slice(0, 20));
  }, []);

  const loadMember = useCallback(
    async (q: string) => {
      const { data } = await api.GET('/api/staff/members', { params: { query: { q } } });
      const hit =
        data?.find((m) => m.memberNumber.toLowerCase() === q.toLowerCase()) ??
        (data?.length === 1 ? data[0] : undefined);
      if (!hit) return push(false, `Geen lid gevonden voor “${q}”`);
      const detail = await api.GET('/api/staff/members/{id}', { params: { path: { id: hit.id } } });
      if (detail.data) setMember(detail.data);
    },
    [push],
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
        if (!member) return push(false, 'Scan eerst een lidpas');
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
            ? ` — boete ${money(data.fine.amountCents)} voor ${data.loan.memberName}`
            : '';
          push(
            true,
            `Ingenomen: “${data.loan.title}” (${data.loan.memberName})${data.daysLate ? `, ${data.daysLate} dag(en) te laat` : ''}${fine}${data.reservedFor ? ` — LEG APART: gereserveerd voor ${data.reservedFor}` : ''}`,
          );
        } else push(false, errorMessage(error));
        await refresh();
      }
    },
    [mode, member, condition, push, refresh],
  );

  return (
    <>
      <h1>Balie</h1>
      <div role="tablist" aria-label="Actie" className="tabs">
        <button
          role="tab"
          aria-selected={mode === 'checkout'}
          className={mode === 'checkout' ? '' : 'secondary'}
          onClick={() => setMode('checkout')}
        >
          Uitlenen
        </button>
        <button
          role="tab"
          aria-selected={mode === 'checkin'}
          className={mode === 'checkin' ? '' : 'secondary'}
          onClick={() => setMode('checkin')}
        >
          Innemen
        </button>
      </div>

      {mode === 'checkout' && (
        <section aria-label="Lid">
          <BarcodeInput label="Lidnummer, naam of e-mail" onScan={loadMember} autoFocus={!member} />
          {member && (
            <div className="member-card" aria-live="polite">
              <h2>
                <Link to={`/staff/members/${member.id}`}>{member.name}</Link>{' '}
                <small>{member.memberNumber}</small>
              </h2>
              <ul className="badges">
                <li>{member.activeLoans} uitgeleend</li>
                {member.overdueLoans > 0 && <li className="bad">{member.overdueLoans} te laat</li>}
                {member.outstandingFinesCents > 0 && (
                  <li className="bad">Boete {money(member.outstandingFinesCents)}</li>
                )}
                {member.blocked && <li className="bad">Geblokkeerd</li>}
                {!member.membershipValid && <li className="bad">Lidmaatschap verlopen</li>}
              </ul>
              <button className="link" onClick={() => setMember(null)}>
                Ander lid
              </button>
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

      <section aria-label="Exemplaar">
        <BarcodeInput
          label={mode === 'checkout' ? 'Scan exemplaar (barcode)' : 'Scan ingeleverd exemplaar'}
          onScan={scanCopy}
          autoFocus={mode === 'checkin' || !!member}
        />
      </section>

      <h2>Verwerkt</h2>
      <ul className="log" aria-live="polite">
        {log.length === 0 && <li>Nog niets gescand.</li>}
        {log.map((e) => (
          <li key={e.id} className={e.ok ? 'ok' : 'bad'}>
            <span aria-hidden="true">{e.ok ? '✓' : '✗'}</span> {e.text}
          </li>
        ))}
      </ul>
    </>
  );
}
