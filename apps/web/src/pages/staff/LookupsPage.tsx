import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { components } from '@biblio/api-client';
import { api, errorMessage } from '../../api';

type Named = components['schemas']['NamedDto'];
const KINDS = [
  ['authors', 'Auteurs'],
  ['genres', 'Genres'],
  ['tags', 'Tags'],
  ['series', 'Reeksen'],
] as const;

export function LookupsPage() {
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>('authors');
  const [rows, setRows] = useState<Named[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.GET('/api/staff/lookups/{kind}', { params: { path: { kind } } });
    setRows(data ?? []);
  }, [kind]);
  useEffect(() => {
    void load();
  }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    const { error: err } = await api.POST('/api/staff/lookups/{kind}', {
      params: { path: { kind } },
      body: { name },
    });
    setError(err ? errorMessage(err) : null);
    setName('');
    void load();
  }
  async function rename(r: Named) {
    const next = window.prompt('Nieuwe naam', r.name);
    if (!next || next === r.name) return;
    const { error: err } = await api.PATCH('/api/staff/lookups/{kind}/{id}', {
      params: { path: { kind, id: r.id } },
      body: { name: next },
    });
    setError(err ? errorMessage(err) : null);
    void load();
  }
  async function remove(r: Named) {
    if (!window.confirm(`“${r.name}” verwijderen? (${r.books} boek(en) verliezen deze koppeling)`))
      return;
    await api.DELETE('/api/staff/lookups/{kind}/{id}', { params: { path: { kind, id: r.id } } });
    void load();
  }

  return (
    <>
      <p>
        <Link to="/staff/books">← Collectiebeheer</Link>
      </p>
      <h1>Auteurs, genres, tags en reeksen</h1>
      <div role="tablist" aria-label="Soort" className="tabs">
        {KINDS.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={kind === k}
            className={kind === k ? '' : 'secondary'}
            onClick={() => setKind(k)}
          >
            {label}
          </button>
        ))}
      </div>
      <form onSubmit={add} className="field-row">
        <label className="field grow">
          <span>Nieuwe naam</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <button type="submit">Toevoegen</button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th scope="col">Naam</th>
            <th scope="col">Boeken</th>
            <th scope="col">
              <span className="sr-only">Acties</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{r.books}</td>
              <td>
                <button className="link" onClick={() => void rename(r)}>
                  Hernoemen
                </button>{' '}
                <button className="link danger" onClick={() => void remove(r)}>
                  Verwijderen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
