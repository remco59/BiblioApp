import { useEffect, useState } from 'react';
import { api } from '../../api';

type Item = {
  id: number;
  action: string;
  userEmail: string | null;
  detail: string | null;
  createdAt: string;
};

export function AuditPage() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; pageSize: number; items: Item[] } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api
        .GET('/api/admin/audit', {
          params: { query: { action: action || undefined, page: String(page) } },
        })
        .then(({ data: d }) => setData(d ?? null));
    }, 200);
    return () => clearTimeout(t);
  }, [action, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <>
      <h1>Auditlog</h1>
      <label className="field">
        <span>Filter op actie (bijv. “loan”, “auth.login”, “admin”)</span>
        <input
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
        />
      </label>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Tijd</th>
              <th scope="col">Gebruiker</th>
              <th scope="col">Actie</th>
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((i) => (
              <tr key={i.id}>
                <td>{new Date(i.createdAt).toLocaleString('nl-NL')}</td>
                <td>{i.userEmail ?? 'systeem'}</td>
                <td>
                  <code>{i.action}</code>
                </td>
                <td className="detail">{i.detail ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="pagination">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Vorige
        </button>
        <span>
          Pagina {page} van {pages} ({data?.total ?? 0} regels)
        </span>
        <button disabled={page >= pages} onClick={() => setPage(page + 1)}>
          Volgende
        </button>
      </p>
    </>
  );
}
