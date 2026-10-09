import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { BookPage, Filters } from '@biblio/api-client';
import { api } from '../api';
import { BookList } from '../components/BookCard';
import { Pagination } from '../components/Pagination';
import { useServerEvent } from '../lib/events';
import { languageName } from '../lib/format';
import { LoadError, Loading } from '../components/LoadState';

const SORTS = [
  ['relevance', 'Relevantie'],
  ['title', 'Titel A–Z'],
  ['year_desc', 'Jaar (nieuw → oud)'],
  ['year_asc', 'Jaar (oud → nieuw)'],
  ['newest', 'Recent toegevoegd'],
] as const;

type Sort = (typeof SORTS)[number][0];

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<Filters | null>(null);
  const [result, setResult] = useState<BookPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState(params.get('q') ?? '');
  const [refresh, setRefresh] = useState(0);
  // Op mobiel staan de filters ingeklapt, zodat de boeken meteen in beeld zijn.
  const [filtersOpen, setFiltersOpen] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 701px)').matches,
  );
  const activeFilters = ['genre', 'language', 'yearFrom', 'yearTo', 'available'].filter((k) =>
    params.get(k),
  ).length;
  // Realtime: beschikbaarheid verandert ergens → lijst opnieuw ophalen
  useServerEvent('availability', () => setRefresh((n) => n + 1));

  const get = (k: string) => params.get(k) ?? '';
  const page = Number(get('page') || 1);

  useEffect(() => {
    api.GET('/api/catalog/filters').then(({ data }) => data && setFilters(data));
  }, []);

  useEffect(() => {
    setQ(params.get('q') ?? '');
    let stale = false;
    const num = (k: string) => (params.get(k) ? Number(params.get(k)) : undefined);
    api
      .GET('/api/books', {
        params: {
          query: {
            q: params.get('q') || undefined,
            genre: params.get('genre') || undefined,
            language: params.get('language') || undefined,
            yearFrom: num('yearFrom'),
            yearTo: num('yearTo'),
            available: params.get('available') === 'true' ? true : undefined,
            sort: (params.get('sort') as Sort) || undefined,
            page: num('page'),
            pageSize: 12,
          },
        },
      })
      .then(({ data }) => {
        if (stale) return;
        if (data) {
          setResult(data);
          setError(null);
        } else setError('De catalogus');
      })
      .catch(() => !stale && setError('De catalogus'));
    return () => {
      stale = true;
    };
  }, [params, refresh]);

  function update(changes: Record<string, string | null>, resetPage = true) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (resetPage) next.delete('page');
    setParams(next);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    update({ q: q.trim() || null });
  }

  return (
    <>
      <h1>Catalogus</h1>
      <form role="search" onSubmit={submit} className="searchbar">
        <label htmlFor="q" className="sr-only">
          Zoeken op titel, auteur, ISBN of trefwoord
        </label>
        <input
          id="q"
          type="search"
          placeholder="Titel, auteur of ISBN"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit">Zoeken</button>
      </form>

      <div className="catalog-layout">
        <details
          className="filters-wrap"
          open={filtersOpen}
          onToggle={(e) => setFiltersOpen(e.currentTarget.open)}
        >
          <summary>Filters{activeFilters > 0 && ` (${activeFilters} actief)`}</summary>
          <form className="filters" aria-label="Filters" onSubmit={(e) => e.preventDefault()}>
            <label className="field">
              <span>Genre</span>
              <select
                value={get('genre')}
                onChange={(e) => update({ genre: e.target.value || null })}
              >
                <option value="">Alle genres</option>
                {filters?.genres.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Taal</span>
              <select
                value={get('language')}
                onChange={(e) => update({ language: e.target.value || null })}
              >
                <option value="">Alle talen</option>
                {filters?.languages.map((l) => (
                  <option key={l} value={l}>
                    {languageName(l)}
                  </option>
                ))}
              </select>
            </label>
            <div className="field-row">
              <label className="field">
                <span>Jaar vanaf</span>
                <input
                  type="number"
                  min={filters?.minYear ?? undefined}
                  max={filters?.maxYear ?? undefined}
                  defaultValue={get('yearFrom')}
                  key={`from-${get('yearFrom')}`}
                  onBlur={(e) => update({ yearFrom: e.target.value || null })}
                />
              </label>
              <label className="field">
                <span>tot</span>
                <input
                  type="number"
                  min={filters?.minYear ?? undefined}
                  max={filters?.maxYear ?? undefined}
                  defaultValue={get('yearTo')}
                  key={`to-${get('yearTo')}`}
                  onBlur={(e) => update({ yearTo: e.target.value || null })}
                />
              </label>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={get('available') === 'true'}
                onChange={(e) => update({ available: e.target.checked ? 'true' : null })}
              />
              Alleen beschikbaar
            </label>
            <label className="field">
              <span>Sorteren</span>
              <select
                value={get('sort') || (get('q') ? 'relevance' : 'title')}
                onChange={(e) => update({ sort: e.target.value })}
              >
                {SORTS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="secondary" onClick={() => setParams({})}>
              Filters wissen
            </button>
          </form>
        </details>

        <section aria-label="Resultaten">
          {error && <LoadError what="De catalogus" onRetry={() => setRefresh((n) => n + 1)} />}
          {!result && !error && <Loading label="Catalogus laden…" />}
          {result && (
            <>
              <p role="status" aria-live="polite" className="count">
                {result.total === 0
                  ? 'Geen boeken gevonden'
                  : `${result.total} ${result.total === 1 ? 'boek' : 'boeken'} gevonden`}
              </p>
              {result.total === 0 && !result.suggestion && (
                <p className="empty">
                  Probeer een ander zoekwoord of{' '}
                  <button className="link" onClick={() => setParams({})}>
                    wis alle filters
                  </button>
                  . Staat het boek er echt niet in? <Link to="/my/suggestions">Stel het voor</Link>.
                </p>
              )}
              {result.total === 0 && result.suggestion && (
                <p>
                  Bedoelde je{' '}
                  <button className="link" onClick={() => update({ q: result.suggestion })}>
                    {result.suggestion}
                  </button>
                  ?
                </p>
              )}
              <BookList books={result.items} />
              <Pagination
                page={page}
                pageSize={result.pageSize}
                total={result.total}
                onChange={(p) => update({ page: String(p) }, false)}
              />
            </>
          )}
        </section>
      </div>
    </>
  );
}
