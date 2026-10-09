import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Book } from '@biblio/api-client';
import { Cover } from './BookCard';
import { Icon, type IconName } from './Icon';

/** Rij boeken op een doorlopende houten plank (elk boek draagt zijn eigen stuk plank). */
export function Shelf({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bookshelf">
      <ul className="shelf-row" aria-label={label}>
        {children}
      </ul>
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
        <Cover book={book} size="shelf" decorative />
        <span className="plank" aria-hidden="true" />
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
  const icon: IconName =
    tone === 'ok' ? 'check' : tone === 'bad' ? 'alert' : tone === 'warn' ? 'clock' : 'dot';
  return (
    <span className={`pill ${tone}`}>
      <Icon name={icon} /> {children}
    </span>
  );
}
