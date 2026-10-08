import { Link } from 'react-router-dom';
import type { Loan } from '@biblio/api-client';
import { dateNl } from '../lib/format';

const OUTCOME: Record<string, string> = {
  RETURNED: 'Ingeleverd',
  LOST: 'Verloren',
  DAMAGED: 'Beschadigd',
};

export function LoanTable({
  loans,
  actions,
}: {
  loans: Loan[];
  actions?: (l: Loan) => React.ReactNode;
}) {
  if (loans.length === 0) return <p>Geen uitleningen.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Titel</th>
            <th scope="col">Uitgeleend</th>
            <th scope="col">Uiterste datum</th>
            <th scope="col">Status</th>
            {actions && (
              <th scope="col">
                <span className="sr-only">Acties</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {loans.map((l) => (
            <tr key={l.id}>
              <td>
                <Link to={`/books/${l.bookId}`}>{l.title}</Link>
              </td>
              <td>{dateNl(l.loanedAt)}</td>
              <td>
                {dateNl(l.dueAt)}
                {l.renewals > 0 && ` (${l.renewals}× verlengd)`}
              </td>
              <td>
                {l.returnedAt ? (
                  `${OUTCOME[l.outcome ?? 'RETURNED']} op ${dateNl(l.returnedAt)}`
                ) : l.overdue ? (
                  <span className="bad">Te laat</span>
                ) : (
                  'Uitgeleend'
                )}
              </td>
              {actions && <td>{!l.returnedAt && actions(l)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
