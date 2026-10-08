import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Loan } from '@biblio/api-client';
import { api, errorMessage } from '../../api';
import { dateNl } from '../../lib/format';

export function OverduePage() {
  const [loans, setLoans] = useState<Loan[] | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.GET('/api/staff/loans', {
      params: { query: { status: 'overdue' } },
    });
    setLoans(data ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function remind(l: Loan) {
    const { error } = await api.POST('/api/staff/loans/{id}/remind', {
      params: { path: { id: l.id } },
    });
    setMessage(
      error
        ? { text: errorMessage(error), error: true }
        : { text: `Aanmaning verstuurd aan ${l.memberName}` },
    );
    void load();
  }

  if (!loans) return <p>Laden…</p>;
  return (
    <>
      <h1>Te late boeken</h1>
      <p>Aanmaningen worden ook automatisch elke nacht verstuurd (herhaling na 7 dagen).</p>
      {message && (
        <p role={message.error ? 'alert' : 'status'} className={message.error ? 'error' : ''}>
          {message.text}
        </p>
      )}
      {loans.length === 0 ? (
        <p>Geen te late boeken. 🎉</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Lid</th>
                <th scope="col">Boek</th>
                <th scope="col">Uiterste datum</th>
                <th scope="col">Dagen te laat</th>
                <th scope="col">Laatste aanmaning</th>
                <th scope="col">
                  <span className="sr-only">Acties</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loans.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link to={`/staff/members/${l.memberId}`}>{l.memberName}</Link>{' '}
                    <small>{l.memberNumber}</small>
                  </td>
                  <td>
                    {l.title} <small>{l.barcode}</small>
                  </td>
                  <td>{dateNl(l.dueAt)}</td>
                  <td className="bad">{l.daysLate}</td>
                  <td>{l.lastNoticeAt ? dateNl(l.lastNoticeAt) : '—'}</td>
                  <td>
                    <button className="link" onClick={() => void remind(l)}>
                      Aanmaning sturen
                    </button>
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
