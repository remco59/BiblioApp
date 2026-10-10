import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Book, Filters } from '@biblio/api-client';
import { api } from '../api';
import { useAuth } from '../auth';
import { Cover } from '../components/BookCard';
import { Icon } from '../components/Icon';
import { SectionHeader, Shelf, ShelfBook, StatusPill } from '../components/Shelf';
import { useServerEvent } from '../lib/events';

function greeting(name?: string) {
  const h = new Date().getHours();
  const part =
    h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond';
  return name ? `${part}, ${name.split(' ')[0]}` : 'Welkom in de bibliotheek';
}

/** Ontdek: rustig en redactioneel — begroeting, zoeken, één uitgelicht boek, twee planken. */
export function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Filters | null>(null);
  const [fresh, setFresh] = useState<Book[]>([]);
  const [available, setAvailable] = useState<Book[]>([]);
  const [recs, setRecs] = useState<Book[]>([]);
  const [refresh, setRefresh] = useState(0);
  useServerEvent('availability', () => setRefresh((n) => n + 1));

  useEffect(() => {
    api.GET('/api/catalog/filters').then(({ data }) => data && setFilters(data));
  }, []);
  useEffect(() => {
    api
      .GET('/api/books', { params: { query: { sort: 'newest', pageSize: 5 } } })
      .then(({ data }) => setFresh(data?.items ?? []));
    api
      .GET('/api/books', { params: { query: { available: true, sort: 'title', pageSize: 5 } } })
      .then(({ data }) => setAvailable(data?.items ?? []));
  }, [refresh]);
  useEffect(() => {
    if (!user) return setRecs([]);
    api.GET('/api/me/recommendations').then(({ data }) => setRecs(data?.slice(0, 5) ?? []));
  }, [user, refresh]);

  const featured = recs[0] ?? fresh.find((b) => b.coverUrl) ?? fresh[0];
  // Het uitgelichte boek staat al groot in beeld; niet nog eens op de planken.
  const notFeatured = (b: Book) => b.id !== featured?.id;
  const shelfOne = available.filter(notFeatured);
  const shelfTwo = (recs.length > 0 ? recs : fresh).filter(notFeatured);

  function submit(e: FormEvent) {
    e.preventDefault();
    navigate(q.trim() ? `/catalogus?q=${encodeURIComponent(q.trim())}` : '/catalogus');
  }

  return (
    <>
      <p className="eyebrow">Ontdek</p>
      <h1>{greeting(user?.name)}</h1>
      <p className="lede">Wat wil je deze week lezen?</p>
      <form role="search" onSubmit={submit} className="searchbar">
        <label htmlFor="home-q" className="sr-only">
          Zoeken op titel, auteur, ISBN of trefwoord
        </label>
        <span className="search-field">
          <Icon name="search" />
          <input
            id="home-q"
            type="search"
            placeholder="Titel, auteur of trefwoord"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </span>
        <button type="submit">Zoeken</button>
      </form>
      {filters && filters.genres.length > 0 && (
        <ul className="chips" aria-label="Genres">
          {filters.genres.slice(0, 5).map((g) => (
            <li key={g}>
              <Link to={`/catalogus?genre=${encodeURIComponent(g)}`}>{g}</Link>
            </li>
          ))}
          {filters.genres.length > 5 && (
            <li>
              <Link to="/catalogus" className="more">
                Alle {filters.genres.length} genres
              </Link>
            </li>
          )}
        </ul>
      )}

      {featured && (
        <div className="hero-wrap">
          <section className="hero" aria-labelledby="hero-h">
            <div className="hero-text">
              <p className="eyebrow">{recs[0] ? 'Voor jou uitgekozen' : 'Nieuw in de kast'}</p>
              <h2 id="hero-h">{featured.title}</h2>
              <p className="meta">{featured.authors.map((a) => a.name).join(', ')}</p>
              <p>
                {featured.copiesAvailable > 0 ? (
                  <StatusPill tone="ok">
                    {featured.copiesAvailable} van {featured.copiesTotal} beschikbaar
                  </StatusPill>
                ) : (
                  <StatusPill tone="warn">Nu uitgeleend, reserveren kan</StatusPill>
                )}
              </p>
              <Link className="button" to={`/books/${featured.id}`}>
                Bekijk boek
              </Link>
            </div>
            <div className="hero-book" aria-hidden="true">
              <Cover book={featured} size="shelf" />
              <div className="plank" />
            </div>
          </section>
        </div>
      )}

      {shelfOne.length > 0 && (
        <section aria-labelledby="avail-h">
          <SectionHeader id="avail-h" title="Nu beschikbaar" to="/catalogus?available=true" />
          <Shelf label="Nu beschikbare boeken">
            {shelfOne.map((b) => (
              <ShelfBook key={b.id} book={b} />
            ))}
          </Shelf>
        </section>
      )}
      {shelfTwo.length > 0 && (
        <section aria-labelledby="second-h">
          <SectionHeader
            id="second-h"
            title={recs.length > 0 ? 'Aanbevolen voor jou' : 'Nieuw in de kast'}
            to="/catalogus?sort=newest"
          />
          <Shelf label={recs.length > 0 ? 'Aanbevolen boeken' : 'Nieuwe boeken'}>
            {shelfTwo.map((b) => (
              <ShelfBook key={b.id} book={b} />
            ))}
          </Shelf>
        </section>
      )}
    </>
  );
}
