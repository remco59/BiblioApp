import { useCallback, useEffect, useState } from 'react';
import type { Notification } from '@biblio/api-client';
import { api } from '../api';
import { useServerEvent } from '../lib/events';
import { dateNl } from '../lib/format';

export function NotificationsPage() {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    const { data } = await api.GET('/api/me/notifications');
    if (data) {
      setItems(data.items);
      setUnread(data.unread);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useServerEvent('notification', () => void load());

  async function read(id: number) {
    await api.POST('/api/me/notifications/{id}/read', { params: { path: { id } } });
    void load();
  }
  async function readAll() {
    await api.POST('/api/me/notifications/read-all');
    void load();
  }

  if (!items) return <p>Laden…</p>;
  return (
    <>
      <h1>Meldingen</h1>
      <p>
        {unread > 0 ? `${unread} ongelezen` : 'Alles gelezen'}{' '}
        {unread > 0 && (
          <button className="link" onClick={() => void readAll()}>
            Alles als gelezen markeren
          </button>
        )}
      </p>
      {items.length === 0 && <p>Je hebt nog geen meldingen.</p>}
      <ul className="notifications">
        {items.map((n) => (
          <li key={n.id} className={n.readAt ? 'read' : 'unread'}>
            <h2>{n.title}</h2>
            <p>{n.body}</p>
            <p className="meta">
              {dateNl(n.createdAt)}
              {!n.readAt && (
                <>
                  {' '}
                  ·{' '}
                  <button className="link" onClick={() => void read(n.id)}>
                    Markeer als gelezen
                  </button>
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
