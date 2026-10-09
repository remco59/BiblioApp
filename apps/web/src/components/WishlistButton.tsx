import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Icon } from './Icon';

export function WishlistButton({ bookId }: { bookId: number }) {
  const { user } = useAuth();
  const [on, setOn] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (!user) return setOn(null);
    const { data } = await api.GET('/api/me/wishlist/ids');
    setOn(data?.includes(bookId) ?? false);
  }, [user, bookId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function toggle() {
    if (on) await api.DELETE('/api/me/wishlist/{bookId}', { params: { path: { bookId } } });
    else await api.POST('/api/me/wishlist', { body: { bookId } });
    void load();
  }

  if (on === null) return null;
  return (
    <button className="secondary icon-btn" aria-pressed={on} onClick={() => void toggle()}>
      <Icon name="heart" filled={on} /> {on ? 'Op je verlanglijst' : 'Zet op verlanglijst'}
    </button>
  );
}
