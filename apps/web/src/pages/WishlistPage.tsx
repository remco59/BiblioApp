import { useCallback, useEffect, useState } from 'react';
import type { Book } from '@biblio/api-client';
import { api } from '../api';
import { BookList } from '../components/BookCard';
import { useServerEvent } from '../lib/events';

export function WishlistPage() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await api.GET('/api/me/wishlist');
    setBooks(data ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useServerEvent('availability', () => void load());

  if (!books) return <p>Laden…</p>;
  return (
    <>
      <h1>Mijn verlanglijst</h1>
      {books.length === 0 ? (
        <p>
          Je verlanglijst is leeg. Open een boek en kies “Op verlanglijst”. Je krijgt een melding
          zodra een boek beschikbaar komt.
        </p>
      ) : (
        <BookList books={books} />
      )}
    </>
  );
}
