import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useServerEvent } from '../lib/events';
import { Icon } from './Icon';

export function NotificationBell() {
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    const { data } = await api.GET('/api/me/notifications', {
      params: { query: { unread: 'true' } },
    });
    if (data) setUnread(data.unread);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useServerEvent('notification', () => void load());

  return (
    <Link
      to="/notifications"
      className="bell"
      aria-label={unread ? `Meldingen, ${unread} ongelezen` : 'Meldingen'}
    >
      <Icon name="bell" />
      {unread > 0 && (
        <span className="badge" aria-hidden="true">
          {unread}
        </span>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {unread > 0 ? `${unread} ongelezen meldingen` : ''}
      </span>
    </Link>
  );
}
