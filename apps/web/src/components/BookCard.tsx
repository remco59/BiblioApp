import { Link } from 'react-router-dom';
import type { Book } from '@biblio/api-client';
import { StatusPill } from './Shelf';
import { Stars } from './Stars';

const TINTS = ['wine', 'forest', 'navy', 'ink'] as const;
const MOTIFS = ['circle', 'corner', 'bands', 'sun'] as const;

function hash(text: string) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h;
}

/**
 * Omslag (of een typografische plaatsvervanger met vaste kleur en motief per titel).
 * `decorative` waar de titel er direct naast staat, zodat schermlezers de titel niet twee keer horen.
 */
export function Cover({
  book,
  size = 'small',
  decorative = false,
}: {
  book: Pick<Book, 'title' | 'coverUrl'> & { authors?: Pick<Book['authors'][number], 'name'>[] };
  size?: 'small' | 'large' | 'shelf';
  decorative?: boolean;
}) {
  if (book.coverUrl) {
    return (
      <img
        className={`cover ${size}`}
        src={book.coverUrl}
        alt={decorative ? '' : `Omslag van ${book.title}`}
        loading="lazy"
      />
    );
  }
  const h = hash(book.title);
  const author = book.authors?.map((a) => a.name).join(' & ');
  return (
    <div
      className={`cover placeholder ${size} tint-${TINTS[h % TINTS.length]} motif-${MOTIFS[(h >> 3) % MOTIFS.length]}`}
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': `Geen omslag voor ${book.title}` })}
    >
      <span className="ph-title">{book.title}</span>
      {author && <span className="ph-author">{author}</span>}
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
