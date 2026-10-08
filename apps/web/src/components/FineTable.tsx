import type { Fine } from '@biblio/api-client';
import { dateNl, money } from '../lib/format';

const REASON: Record<string, string> = {
  OVERDUE: 'Te laat',
  LOST: 'Verloren',
  DAMAGED: 'Beschadigd',
};
const STATUS: Record<string, string> = { OPEN: 'Open', PAID: 'Betaald', WAIVED: 'Kwijtgescholden' };

export function FineTable({
  fines,
  actions,
}: {
  fines: Fine[];
  actions?: (f: Fine) => React.ReactNode;
}) {
  if (fines.length === 0) return <p>Geen boetes.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Datum</th>
            <th scope="col">Reden</th>
            <th scope="col">Boek</th>
            <th scope="col">Bedrag</th>
            <th scope="col">Nog te betalen</th>
            <th scope="col">Status</th>
            {actions && (
              <th scope="col">
                <span className="sr-only">Acties</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {fines.map((f) => (
            <tr key={f.id}>
              <td>{dateNl(f.createdAt)}</td>
              <td>{REASON[f.reason]}</td>
              <td>{f.title ?? '—'}</td>
              <td>{money(f.amountCents)}</td>
              <td>{money(f.outstandingCents)}</td>
              <td>{STATUS[f.status]}</td>
              {actions && <td>{f.status === 'OPEN' && actions(f)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
