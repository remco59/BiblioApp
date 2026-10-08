import { useEffect, useState } from 'react';
import type { Book } from '@biblio/api-client';
import { api } from './api';

export function BookList({ books }: { books: Book[] }) {
  return (
    <ul className="books">
      {books.map((b) => (
        <li key={b.id} className="book">
          <h2>{b.title}</h2>
          <p className="meta">
            {b.authors.map((a) => a.name).join(', ')}
            {b.genre ? ` · ${b.genre}` : ''}
            {b.publishedYear ? ` · ${b.publishedYear}` : ''}
          </p>
          <p className={b.copiesAvailable > 0 ? 'avail ok' : 'avail none'}>
            {b.copiesAvailable} van {b.copiesTotal} beschikbaar
          </p>
        </li>
      ))}
    </ul>
  );
}

export function App() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.GET('/api/books').then(({ data, error: err }) => {
      if (data) setBooks(data);
      else setError(String(err ?? 'Onbekende fout'));
    });
  }, []);

  return (
    <main>
      <header>
        <h1>BiblioApp</h1>
        <p>Catalogus</p>
      </header>
      {error && <p role="alert">Kon boeken niet laden: {error}</p>}
      {!books && !error && <p>Laden…</p>}
      {books && <BookList books={books} />}
    </main>
  );
}
