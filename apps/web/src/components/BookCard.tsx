import { Link } from 'react-router-dom';
import type { Book } from '@biblio/api-client';
import { StatusPill } from './Shelf';
import { Stars } from './Stars';

/**
 * Omslag (of een typografische plaatsvervanger). `decorative` waar de titel er direct naast staat,
 * zodat schermlezers de titel niet twee keer horen.
 */
export function Cover({
  book,
  size = 'small',
  decorative = false,
}: {
  book: Pick<Book, 'title' | 'coverUrl'>;
  size?: 'small' | 'large' | 'shelf';
  decorative?: boolean;
}) {
  return book.coverUrl ? (
    <img
      className={`cover ${size}`}
      src={book.coverUrl}
      alt={decorative ? '' : `Omslag van ${book.title}`}
      loading="lazy"
    />
  ) : (
    <div
      className={`cover placeholder ${size}`}
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': `Geen omslag voor ${book.title}` })}
    >
      <span>{book.title}</span>
    </div>
  );
}

export function Availability({ book }: { book: Pick<Book, 'copiesAvailable' | 'copiesTotal'> }) {
  if (book.copiesTotal === 0) return <StatusPill tone="neutral">Niet in de collectie</StatusPill>;
  return book.copiesAvailable > 0 ? (
    <StatusPill tone="ok">
      {book.copiesAvailable} van {book.copiesTotal} beschikbaar
    </StatusPill>
  ) : (
    <StatusPill tone="warn">Uitgeleend, reserveren kan</StatusPill>
  );
}

/** Eén boek in de catalogus: omslag op een stukje plank; de plankjes vormen samen een kast. */
export function BookCard({ book }: { book: Book }) {
  return (
    <li className="book">
      <div className="book-shelf">
        <Cover book={book} size="shelf" decorative />
        <span className="plank" aria-hidden="true" />
      </div>
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
      <p className="book-avail">
        <Availability book={book} />
      </p>
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
