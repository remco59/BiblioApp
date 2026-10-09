import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Book } from '@biblio/api-client';
import { api } from '../api';
import { Shelf, ShelfBook, StatusPill } from '../components/Shelf';
import { useServerEvent } from '../lib/events';
import { LibraryTabs } from '../components/LibraryTabs';
import { Loading } from '../components/LoadState';

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

  if (!books) return <Loading label="Verlanglijst laden…" />;
  return (
    <>
      <h1>Mijn bibliotheek</h1>
      <LibraryTabs />
      {books.length === 0 ? (
        <p className="empty">
          Je verlanglijst is leeg. Open een boek en kies “Zet op verlanglijst”: je krijgt een
          melding zodra het beschikbaar komt. <Link to="/catalogus">Naar de catalogus</Link>
        </p>
      ) : (
        <Shelf label="Verlanglijst">
          {books.map((b) => (
            <ShelfBook
              key={b.id}
              book={b}
              caption={
                b.copiesAvailable > 0 ? (
                  <StatusPill tone="ok">Beschikbaar</StatusPill>
                ) : (
                  <StatusPill tone="neutral">Uitgeleend</StatusPill>
                )
              }
            />
          ))}
        </Shelf>
      )}
    </>
  );
}
