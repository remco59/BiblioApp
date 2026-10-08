import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Member } from '@biblio/api-client';
import { api } from '../../api';
import { dateNl, money } from '../../lib/format';

export function MembersPage() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Member[]>([]);

  useEffect(() => {
    const t = setTimeout(() => {
      api
        .GET('/api/staff/members', { params: { query: { q: q || undefined } } })
        .then(({ data }) => setRows(data ?? []));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <>
      <h1>Leden</h1>
      <label className="field">
        <span>Zoeken op naam, e-mail of lidnummer</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <table>
        <thead>
          <tr>
            <th scope="col">Lidnummer</th>
            <th scope="col">Naam</th>
            <th scope="col">Uitgeleend</th>
            <th scope="col">Boete</th>
            <th scope="col">Lidmaatschap tot</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id}>
              <td>{m.memberNumber}</td>
              <td>
                <Link to={`/staff/members/${m.id}`}>{m.name}</Link>
              </td>
              <td>
                {m.activeLoans}
                {m.overdueLoans > 0 && <span className="bad"> ({m.overdueLoans} te laat)</span>}
              </td>
              <td>{m.outstandingFinesCents ? money(m.outstandingFinesCents) : '—'}</td>
              <td>{dateNl(m.membershipUntil)}</td>
              <td>
                {m.blocked ? (
                  <span className="bad">Geblokkeerd</span>
                ) : m.membershipValid ? (
                  'Actief'
                ) : (
                  <span className="bad">Verlopen</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
