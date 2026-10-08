import { useEffect, useState } from 'react';
import type { BookDetail } from '@biblio/api-client';
import { api } from '../api';

/** Haalt omslag/auteurs op voor een set boek-id's (uitleningen en reserveringen dragen die niet zelf). */
export function useBooks(ids: number[]) {
  const [books, setBooks] = useState<Record<number, BookDetail>>({});
  const key = [...new Set(ids)].sort((a, b) => a - b).join(',');
  useEffect(() => {
    let stale = false;
    const missing = key
      .split(',')
      .filter(Boolean)
      .map(Number)
      .filter((id) => !books[id]);
    if (missing.length === 0) return;
    void Promise.all(
      missing.map((id) => api.GET('/api/books/{id}', { params: { path: { id } } })),
    ).then((rs) => {
      if (stale) return;
      setBooks((prev) => {
        const next = { ...prev };
        for (const r of rs) if (r.data) next[r.data.id] = r.data;
        return next;
      });
    });
    return () => {
      stale = true;
    };
  }, [key]);
  return books;
}
