import { Children, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Book } from '@biblio/api-client';
import { Cover } from './BookCard';
import { Icon, type IconName } from './Icon';
import { PottedPlant, VasePlant } from './Plants';
import { useShelfTitles } from '../lib/preferences';

/**
 * Rij boeken op één doorlopende houten plank. De plank is een stuk per kolom (inclusief de randen,
 * waar de planten staan), zodat ze door een subgrid op één lijn liggen en samen één plank vormen.
 */
export function Shelf({ label, children }: { label: string; children: ReactNode }) {
  const count = Children.count(children);
  const [showTitles] = useShelfTitles();
  return (
    <div className="bookshelf">
      <ul
        className={`shelf-row${showTitles ? '' : ' tip-room'}`}
        aria-label={label}
        style={{ '--n': count } as CSSProperties}
      >
        <li className="shelf-edge" aria-hidden="true">
          <div className="shelf-stand">
            <PottedPlant className="shelf-plant left" />
            <span className="plank" />
          </div>
          <div className="shelf-info" />
        </li>
        {children}
        <li className="shelf-edge" aria-hidden="true">
          <div className="shelf-stand">
            <VasePlant className="shelf-plant right" />
            <span className="plank" />
          </div>
          <div className="shelf-info" />
        </li>
      </ul>
    </div>
  );
}

/**
 * Eén boek op de plank. Met titelweergave aan staan titel en auteur compact onder het boek; anders
 * verschijnen ze als tooltip bij hover/focus (op touch: eerste tik toont, tweede tik opent).
 */
export function ShelfBook({
  book,
  caption,
  children,
}: {
  book: Pick<Book, 'id' | 'title' | 'coverUrl' | 'authors'>;
  caption?: ReactNode;
  children?: ReactNode;
}) {
  const [showTitles] = useShelfTitles();
  const [armed, setArmed] = useState(false);
  const author = book.authors.map((a) => a.name).join(', ');
  const to = `/books/${book.id}`;

  function onClick(e: MouseEvent) {
    // Alleen zonder hover (touch): de eerste tik laat de titel zien, de tweede opent het boek.
    if (!showTitles && !armed && window.matchMedia?.('(hover: none)').matches) {
      e.preventDefault();
      setArmed(true);
    }
  }

  return (
    <li className="shelf-book">
      <div className="shelf-stand">
        <Link
          to={to}
          className={`shelf-link${armed ? ' armed' : ''}`}
          onClick={onClick}
          onBlur={() => setArmed(false)}
        >
          <Cover book={book} size="shelf" decorative />
          <span className="sr-only">{book.title}</span>
          {!showTitles && (
            <span className="shelf-tip" aria-hidden="true">
              <strong>{book.title}</strong>
              {author && <span>{author}</span>}
            </span>
          )}
        </Link>
        <span className="plank" aria-hidden="true" />
      </div>
      <div className="shelf-info">
        {showTitles && (
          <>
            <Link to={to} className="shelf-title" tabIndex={-1} aria-hidden="true">
              {book.title}
            </Link>
            {author && <span className="shelf-author">{author}</span>}
          </>
        )}
        {caption && <span className="shelf-caption">{caption}</span>}
        {children}
      </div>
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
