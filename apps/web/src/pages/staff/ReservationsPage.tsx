import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Reservation } from '@biblio/api-client';
import { api } from '../../api';
import { useServerEvent } from '../../lib/events';
import { dateNl } from '../../lib/format';

export function ReservationsPage() {
  const [rows, setRows] = useState<Reservation[] | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.GET('/api/staff/reservations');
    setRows(data ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useServerEvent('availability', () => void load());

  async function cancel(r: Reservation) {
    if (!window.confirm(`Reservering van ${r.memberName} voor “${r.title}” annuleren?`)) return;
    await api.POST('/api/staff/reservations/{id}/cancel', { params: { path: { id: r.id } } });
    void load();
  }

  if (!rows) return <p>Laden…</p>;
  return (
    <>
      <h1>Reserveringen</h1>
      {rows.length === 0 ? (
        <p>Geen openstaande reserveringen.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Boek</th>
                <th scope="col">Lid</th>
                <th scope="col">Status</th>
                <th scope="col">Gereserveerd op</th>
                <th scope="col">
                  <span className="sr-only">Acties</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/books/${r.bookId}`}>{r.title}</Link>
                  </td>
                  <td>
                    {r.memberName} <small>{r.memberNumber}</small>
                  </td>
                  <td>
                    {r.status === 'READY' ? (
                      <span className="ok">Klaar tot {r.expiresAt && dateNl(r.expiresAt)}</span>
                    ) : (
                      `Wachtrij plek ${r.position}`
                    )}
                  </td>
                  <td>{dateNl(r.createdAt)}</td>
                  <td>
                    <button className="link danger" onClick={() => void cancel(r)}>
                      Annuleren
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
