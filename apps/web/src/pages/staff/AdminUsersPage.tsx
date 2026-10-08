import { useCallback, useEffect, useState } from 'react';
import type { AdminUser } from '@biblio/api-client';
import { api, errorMessage } from '../../api';
import { useAuth } from '../../auth';

const ROLES = [
  ['MEMBER', 'Lid'],
  ['LIBRARIAN', 'Bibliothecaris'],
  ['ADMIN', 'Beheerder'],
] as const;

export function AdminUsersPage() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.GET('/api/admin/users', {
      params: { query: { q: q || undefined } },
    });
    setRows(data ?? []);
  }, [q]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  async function update(
    u: AdminUser,
    body: { role?: 'MEMBER' | 'LIBRARIAN' | 'ADMIN'; disabled?: boolean },
  ) {
    const { error } = await api.PATCH('/api/admin/users/{id}', {
      params: { path: { id: u.id } },
      body,
    });
    setMessage(
      error ? { text: errorMessage(error), error: true } : { text: `${u.name} bijgewerkt` },
    );
    void load();
  }

  return (
    <>
      <h1>Gebruikers en rollen</h1>
      <p>Een rol- of statuswijziging beëindigt de lopende sessies van die gebruiker.</p>
      <label className="field">
        <span>Zoeken op naam of e-mail</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {message && (
        <p role={message.error ? 'alert' : 'status'} className={message.error ? 'error' : ''}>
          {message.text}
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Naam</th>
              <th scope="col">E-mail</th>
              <th scope="col">Rol</th>
              <th scope="col">2FA</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.name}
                  {u.memberNumber && <small> {u.memberNumber}</small>}
                </td>
                <td>{u.email}</td>
                <td>
                  <select
                    aria-label={`Rol van ${u.name}`}
                    value={u.role}
                    disabled={u.id === user?.id}
                    onChange={(e) =>
                      void update(u, { role: e.target.value as 'MEMBER' | 'LIBRARIAN' | 'ADMIN' })
                    }
                  >
                    {ROLES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{u.totpEnabled ? 'Aan' : '—'}</td>
                <td>
                  {u.disabled ? <span className="bad">Uitgeschakeld</span> : 'Actief'}{' '}
                  {u.id !== user?.id && (
                    <button
                      className="link"
                      onClick={() => void update(u, { disabled: !u.disabled })}
                    >
                      {u.disabled ? 'Inschakelen' : 'Uitschakelen'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
