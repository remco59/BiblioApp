import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { BookDetail } from '@biblio/api-client';
import { api } from '../api';
import { useAuth } from '../auth';
import { Cover } from '../components/BookCard';
import { SectionHeader, Shelf, ShelfBook, StatusPill } from '../components/Shelf';
import { LoadError, Loading } from '../components/LoadState';
import { ReserveBox } from '../components/ReserveBox';
import { Reviews } from '../components/Reviews';
import { Stars } from '../components/Stars';
import { WishlistButton } from '../components/WishlistButton';
import { useServerEvent } from '../lib/events';
import { languageName } from '../lib/format';

const STATUS: Record<string, string> = {
  AVAILABLE: 'Beschikbaar',
  LOANED: 'Uitgeleend',
  RESERVED_HOLD: 'Klaargelegd voor reservering',
  LOST: 'Verloren',
  DAMAGED: 'Beschadigd',
};

export function BookDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [book, setBook] = useState<BookDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [failed, setFailed] = useState(false);
  const isStaff = user?.role === 'LIBRARIAN' || user?.role === 'ADMIN';

  const load = useCallback(async () => {
    setFailed(false);
    const { data, response } = await api
      .GET('/api/books/{id}', { params: { path: { id: Number(id) } } })
      .catch(() => ({ data: undefined, response: undefined }));
    if (data) setBook(data);
    else if (response?.status === 404 || response?.status === 400) setNotFound(true);
    else setFailed(true);
  }, [id]);

  useEffect(() => {
    setBook(null);
    setNotFound(false);
    void load();
  }, [load, user?.id]);
  // Realtime: beschikbaarheid van dit boek veranderd
  useServerEvent('availability', (d) => {
    if (d.bookId === Number(id)) void load();
  });

  if (notFound)
    return (
      <div className="load-error" role="alert">
        <p>
          <strong>Dit boek staat niet (meer) in de collectie.</strong>
        </p>
        <Link className="button secondary" to="/catalogus">
          Zoek in de catalogus
        </Link>
      </div>
    );
  if (failed) return <LoadError what="Dit boek" onRetry={() => void load()} />;
  if (!book) return <Loading label="Boek laden…" />;
  const counts = book.copies.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <article className="book-detail">
      <p>
        <Link to="/catalogus" className="back">
          ← Catalogus
        </Link>
      </p>
      <div className="detail-head">
        <div className="detail-cover">
          <Cover book={book} size="shelf" />
          <div className="plank" aria-hidden="true" />
        </div>
        <div className="detail-info">
          <h1>{book.title}</h1>
          <p className="meta">{book.authors.map((a) => a.name).join(', ')}</p>
          {book.ratingCount > 0 && (
            <p>
              <Stars value={book.ratingAverage} count={book.ratingCount} />
            </p>
          )}
          <dl>
            {book.genre && (
              <>
                <dt>Genre</dt>
                <dd>{book.genre}</dd>
              </>
            )}
            {book.publishedYear && (
              <>
                <dt>Jaar</dt>
                <dd>{book.publishedYear}</dd>
              </>
            )}
            <dt>Taal</dt>
            <dd>{languageName(book.language)}</dd>
            {book.isbn && (
              <>
                <dt>ISBN</dt>
                <dd>{book.isbn}</dd>
              </>
            )}
            {book.series && (
              <>
                <dt>Reeks</dt>
                <dd>
                  {book.series}
                  {book.seriesNumber ? ` (deel ${book.seriesNumber})` : ''}
                </dd>
              </>
            )}
            {book.tags.length > 0 && (
              <>
                <dt>Trefwoorden</dt>
                <dd>{book.tags.join(', ')}</dd>
              </>
            )}
          </dl>
          <p>
            {book.copiesAvailable > 0 ? (
              <StatusPill tone="ok">
                {book.copiesAvailable} van {book.copiesTotal} beschikbaar
              </StatusPill>
            ) : (
              <StatusPill tone="bad">
                {book.copiesTotal === 0
                  ? 'Niet in de collectie'
                  : book.copiesTotal === 1
                    ? 'Uitgeleend'
                    : `Alle ${book.copiesTotal} exemplaren uitgeleend`}
              </StatusPill>
            )}
          </p>
          <ReserveBox book={book} onChange={() => void load()} />
          <p className="actions">
            <WishlistButton bookId={book.id} />
            {isStaff && (
              <Link className="button secondary" to={`/staff/books/${book.id}`}>
                Bewerken
              </Link>
            )}
          </p>
        </div>
      </div>
      {book.description && (
        <section aria-labelledby="desc-h">
          <h2 id="desc-h">Over dit boek</h2>
          <p className="description">{book.description}</p>
        </section>
      )}

      <h2>Exemplaren</h2>
      {book.copies.length === 0 ? (
        <p>Geen exemplaren in de collectie.</p>
      ) : !isStaff ? (
        <ul className="copy-summary">
          {Object.entries(counts).map(([status, n]) => (
            <li key={status}>
              <StatusPill
                tone={
                  status === 'AVAILABLE'
                    ? 'ok'
                    : status === 'LOANED' || status === 'RESERVED_HOLD'
                      ? 'warn'
                      : 'bad'
                }
              >
                {n}× {(STATUS[status] ?? status).toLowerCase()}
              </StatusPill>
            </li>
          ))}
        </ul>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Barcode</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {book.copies.map((c) => (
                <tr key={c.id}>
                  <td>{c.barcode}</td>
                  <td>
                    <StatusPill
                      tone={
                        c.status === 'AVAILABLE'
                          ? 'ok'
                          : c.status === 'LOANED' || c.status === 'RESERVED_HOLD'
                            ? 'warn'
                            : 'bad'
                      }
                    >
                      {STATUS[c.status] ?? c.status}
                    </StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Reviews bookId={book.id} />

      {book.similar.length > 0 && (
        <>
          <SectionHeader title="Vergelijkbare boeken" />
          <Shelf label="Vergelijkbare boeken">
            {book.similar.map((b) => (
              <ShelfBook key={b.id} book={b} />
            ))}
          </Shelf>
        </>
      )}
    </article>
  );
}
