import { useEffect, useState } from 'react';
import type { Book } from '@biblio/api-client';
import { api } from '../api';
import { useAuth } from '../auth';
import { BookList } from './BookCard';

/** “Aanbevolen voor jou”: alleen voor ingelogde leden, en alleen op de ongefilterde catalogus. */
export function Recommendations({ refresh }: { refresh: number }) {
  const { user } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);

  useEffect(() => {
    if (!user) return setBooks([]);
    api.GET('/api/me/recommendations').then(({ data }) => setBooks(data?.slice(0, 4) ?? []));
  }, [user, refresh]);

  if (books.length === 0) return null;
  return (
    <section aria-labelledby="rec-h" className="recs">
      <h2 id="rec-h">Aanbevolen voor jou</h2>
      <BookList books={books} />
    </section>
  );
}
