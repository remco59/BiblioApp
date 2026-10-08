import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { BookDetail } from '@biblio/api-client';
import { api } from '../api';
import { useAuth } from '../auth';
import { Cover } from '../components/BookCard';
import { SectionHeader, Shelf, ShelfBook, StatusPill } from '../components/Shelf';
import { ReserveBox } from '../components/ReserveBox';
import { Reviews } from '../components/Reviews';
import { Stars } from '../components/Stars';
import { WishlistButton } from '../components/WishlistButton';
import { useServerEvent } from '../lib/events';

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
  const isStaff = user?.role === 'LIBRARIAN' || user?.role === 'ADMIN';

  const load = useCallback(async () => {
    const { data } = await api.GET('/api/books/{id}', { params: { path: { id: Number(id) } } });
    if (data) setBook(data);
    else setNotFound(true);
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
      <p role="alert">
        Boek niet gevonden. <Link to="/catalogus">Terug naar de catalogus</Link>
      </p>
    );
  if (!book) return <p>Laden…</p>;
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
            <dd>{book.language}</dd>
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
                Uitgeleend — {book.copiesAvailable} van {book.copiesTotal} beschikbaar
              </StatusPill>
            )}
          </p>
          <ReserveBox book={book} onChange={() => void load()} />
          <p>
            <WishlistButton bookId={book.id} />
          </p>
          {isStaff && (
            <p>
              <Link to={`/staff/books/${book.id}`}>Bewerken</Link>
            </p>
          )}
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
      ) : (
        <table>
          <thead>
            <tr>
              {isStaff && <th scope="col">Barcode</th>}
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {book.copies.map((c) => (
              <tr key={c.id}>
                {isStaff && <td>{c.barcode}</td>}
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
