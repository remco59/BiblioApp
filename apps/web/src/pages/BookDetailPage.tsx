import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { BookDetail } from '@biblio/api-client';
import { api } from '../api';
import { useAuth } from '../auth';
import { Availability, BookList, Cover } from '../components/BookCard';

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

  useEffect(() => {
    setBook(null);
    setNotFound(false);
    api.GET('/api/books/{id}', { params: { path: { id: Number(id) } } }).then(({ data }) => {
      if (data) setBook(data);
      else setNotFound(true);
    });
  }, [id, user?.id]);

  if (notFound)
    return (
      <p role="alert">
        Boek niet gevonden. <Link to="/">Terug naar de catalogus</Link>
      </p>
    );
  if (!book) return <p>Laden…</p>;
  return (
    <article className="detail">
      <p>
        <Link to="/">← Catalogus</Link>
      </p>
      <div className="detail-head">
        <Cover book={book} size="large" />
        <div>
          <h1>{book.title}</h1>
          <p className="meta">{book.authors.map((a) => a.name).join(', ')}</p>
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
          <Availability book={book} />
          {isStaff && (
            <p>
              <Link to={`/staff/books/${book.id}`}>Bewerken</Link>
            </p>
          )}
        </div>
      </div>
      {book.description && <p className="description">{book.description}</p>}

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
                <td>{STATUS[c.status] ?? c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {book.similar.length > 0 && (
        <>
          <h2>Vergelijkbare boeken</h2>
          <BookList books={book.similar} />
        </>
      )}
    </article>
  );
}
