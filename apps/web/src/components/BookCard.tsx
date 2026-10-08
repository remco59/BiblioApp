import { Link } from 'react-router-dom';
import type { Book } from '@biblio/api-client';
import { Stars } from './Stars';

export function Cover({
  book,
  size = 'small',
}: {
  book: Pick<Book, 'title' | 'coverUrl'>;
  size?: 'small' | 'large' | 'shelf';
}) {
  return book.coverUrl ? (
    <img
      className={`cover ${size}`}
      src={book.coverUrl}
      alt={`Omslag van ${book.title}`}
      loading="lazy"
    />
  ) : (
    <div
      className={`cover placeholder ${size}`}
      role="img"
      aria-label={`Geen omslag voor ${book.title}`}
    >
      {book.title.slice(0, 1)}
    </div>
  );
}

export function Availability({ book }: { book: Pick<Book, 'copiesAvailable' | 'copiesTotal'> }) {
  const ok = book.copiesAvailable > 0;
  return (
    <p className={ok ? 'avail ok' : 'avail none'}>
      {ok ? '✓' : '✗'} {book.copiesAvailable} van {book.copiesTotal} beschikbaar
    </p>
  );
}

export function BookCard({ book }: { book: Book }) {
  return (
    <li className="book">
      <Cover book={book} />
      <div>
        <h2>
          <Link to={`/books/${book.id}`}>{book.title}</Link>
        </h2>
        <p className="meta">
          {book.authors.map((a) => a.name).join(', ')}
          {book.genre ? ` · ${book.genre}` : ''}
          {book.publishedYear ? ` · ${book.publishedYear}` : ''}
        </p>
        {book.ratingCount > 0 && (
          <p className="meta">
            <Stars value={book.ratingAverage} count={book.ratingCount} />
          </p>
        )}
        <Availability book={book} />
      </div>
    </li>
  );
}

export function BookList({ books }: { books: Book[] }) {
  return (
    <ul className="books">
      {books.map((b) => (
        <BookCard key={b.id} book={b} />
      ))}
    </ul>
  );
}
