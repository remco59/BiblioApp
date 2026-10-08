import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import type { BookPage } from '@biblio/api-client';
import { api, errorMessage } from '../../api';

export function StaffBooksPage() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<BookPage | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.GET('/api/books', {
      params: { query: { q: q || undefined, page, pageSize: 20 } },
    });
    if (data) setResult(data);
  }, [q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(id: number, title: string) {
    if (!window.confirm(`“${title}” en alle exemplaren verwijderen?`)) return;
    const { error } = await api.DELETE('/api/staff/books/{id}', { params: { path: { id } } });
    setMessage(error ? errorMessage(error) : `“${title}” verwijderd`);
    void load();
  }

  async function importCsv(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const res = await fetch('/api/staff/books/import', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'text/csv', 'X-CSRF-Token': (await csrf()) ?? '' },
      body: await file.text(),
    });
    const body = await res.json();
    setMessage(
      res.ok
        ? `Import klaar: ${body.created} nieuw, ${body.updated} bijgewerkt${body.errors.length ? `, ${body.errors.length} fouten: ${body.errors.join('; ')}` : ''}`
        : errorMessage(body),
    );
    e.target.value = '';
    void load();
  }

  return (
    <>
      <h1>Collectiebeheer</h1>
      <p className="actions">
        <Link to="/staff/books/new" className="button">
          Nieuw boek
        </Link>
        <a href="/api/staff/books.csv" className="button secondary" download>
          Exporteer CSV
        </a>
        <label className="button secondary">
          Importeer CSV
          <input type="file" accept=".csv,text/csv" onChange={importCsv} className="sr-only" />
        </label>
        <Link to="/staff/lookups" className="button secondary">
          Auteurs, genres en tags
        </Link>
      </p>
      {message && <p role="status">{message}</p>}
      <label className="field">
        <span>Zoeken</span>
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
      </label>
      {result && (
        <table>
          <thead>
            <tr>
              <th scope="col">Titel</th>
              <th scope="col">Auteur(s)</th>
              <th scope="col">Exemplaren</th>
              <th scope="col">
                <span className="sr-only">Acties</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((b) => (
              <tr key={b.id}>
                <td>
                  <Link to={`/books/${b.id}`}>{b.title}</Link>
                </td>
                <td>{b.authors.map((a) => a.name).join(', ')}</td>
                <td>
                  {b.copiesAvailable}/{b.copiesTotal}
                </td>
                <td>
                  <Link to={`/staff/books/${b.id}`}>Bewerken</Link>{' '}
                  <Link to={`/staff/labels?bookId=${b.id}`}>Etiketten</Link>{' '}
                  <button className="link danger" onClick={() => void remove(b.id, b.title)}>
                    Verwijderen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {result && result.total > result.pageSize && (
        <p className="pagination">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Vorige
          </button>
          <span>Pagina {page}</span>
          <button
            disabled={page * result.pageSize >= result.total}
            onClick={() => setPage(page + 1)}
          >
            Volgende
          </button>
        </p>
      )}
    </>
  );
}

async function csrf(): Promise<string | null> {
  const { data } = await api.GET('/api/auth/me');
  return data?.csrfToken ?? null;
}
