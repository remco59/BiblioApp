import { useCallback, useEffect, useState } from 'react';
import type { MemberDetail } from '@biblio/api-client';
import { api, errorMessage } from '../api';
import { FineTable } from '../components/FineTable';
import { LoanTable } from '../components/LoanTable';
import { dateNl, money } from '../lib/format';

export function MyLoansPage() {
  const [m, setM] = useState<MemberDetail | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.GET('/api/me/membership');
    setM(data ?? null);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function renew(id: number) {
    const { error } = await api.POST('/api/me/loans/{id}/renew', { params: { path: { id } } });
    setMessage(error ? { text: errorMessage(error), error: true } : { text: 'Verlengd' });
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
      <h2>Boetes</h2>
      <FineTable fines={m.fines} />
      <h2>Geschiedenis</h2>
      <LoanTable loans={m.loans.filter((l) => l.returnedAt)} />
    </>
  );
}
