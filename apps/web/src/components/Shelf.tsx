import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Book } from '@biblio/api-client';
import { Cover } from './BookCard';

/** Rij boeken die op een doorlopende houten plank staat. */
export function Shelf({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="shelf">
      <ul className="shelf-row" aria-label={label}>
        {children}
      </ul>
      <div className="plank" aria-hidden="true" />
    </div>
  );
}

/** Eén boek op de plank: omslag + titel in één link, met optionele onderregel en acties. */
export function ShelfBook({
  book,
  caption,
  children,
}: {
  book: Pick<Book, 'id' | 'title' | 'coverUrl' | 'authors'>;
  caption?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="shelf-book">
      <Link to={`/books/${book.id}`} className="shelf-link">
        <Cover book={book} size="shelf" />
        <span className="shelf-title">{book.title}</span>
      </Link>
      <span className="shelf-author">{book.authors.map((a) => a.name).join(', ')}</span>
      {caption && <span className="shelf-caption">{caption}</span>}
      {children}
    </li>
  );
}

/** Sectiekop met optionele “Alles bekijken”-actie. */
export function SectionHeader({
  id,
  title,
  to,
  toLabel = 'Alles bekijken',
}: {
  id?: string;
  title: string;
  to?: string;
  toLabel?: string;
}) {
  return (
    <div className="section-header">
      <h2 id={id}>{title}</h2>
      {to && <Link to={to}>{toLabel} →</Link>}
    </div>
  );
}

/** Statuslabel: altijd icoon + tekst, nooit alleen kleur. */
export function StatusPill({
  tone,
  children,
}: {
  tone: 'ok' | 'warn' | 'bad' | 'neutral';
  children: ReactNode;
}) {
  const icon = tone === 'ok' ? '✓' : tone === 'bad' ? '!' : tone === 'warn' ? '◷' : '•';
  return (
    <span className={`pill ${tone}`}>
      <span aria-hidden="true">{icon}</span> {children}
    </span>
  );
}
