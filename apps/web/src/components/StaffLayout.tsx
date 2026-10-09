import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';

type Item = { to: string; label: string; admin?: boolean };
type Group = { title: string; items: Item[] };

/** De werkplek van medewerkers, gegroepeerd naar taak in plaats van één lange rij links. */
const GROUPS: Group[] = [
  {
    title: 'Balie',
    items: [
      { to: '/staff/desk', label: 'Uitlenen en innemen' },
      { to: '/staff/reservations', label: 'Reserveringen' },
      { to: '/staff/overdue', label: 'Te laat' },
    ],
  },
  {
    title: 'Collectie',
    items: [
      { to: '/staff/books', label: 'Boeken' },
      { to: '/staff/lookups', label: 'Auteurs en genres' },
      { to: '/staff/labels', label: 'Etiketten' },
      { to: '/staff/moderation', label: 'Reviews en suggesties' },
    ],
  },
  {
    title: 'Leden',
    items: [
      { to: '/staff/members', label: 'Leden' },
      { to: '/staff/reports', label: 'Rapportages' },
    ],
  },
  {
    title: 'Beheer',
    items: [
      { to: '/admin/settings', label: 'Instellingen', admin: true },
      { to: '/admin/users', label: 'Gebruikers', admin: true },
      { to: '/admin/templates', label: 'Mailteksten', admin: true },
      { to: '/admin/audit', label: 'Auditlog', admin: true },
    ],
  },
];

export function StaffLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const isAdmin = user?.role === 'ADMIN';
  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.admin || isAdmin),
  })).filter((g) => g.items.length > 0);
  const current = groups
    .flatMap((g) => g.items)
    .find((i) => pathname === i.to || pathname.startsWith(i.to + '/'));

  const links = (
    <>
      {groups.map((g) => (
        <div key={g.title} className="staff-group">
          <p className="staff-group-title" aria-hidden="true">
            {g.title}
          </p>
          <ul aria-label={g.title}>
            {g.items.map((i) => (
              <li key={i.to}>
                <NavLink to={i.to}>{i.label}</NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );

  return (
    <div className="staff-layout">
      <nav className="staff-side" aria-label="Werkplek">
        {links}
      </nav>
      <details className="staff-menu" key={pathname}>
        <summary>
          Werkplek<span aria-hidden="true"> · </span>
          <strong>{current?.label ?? 'menu'}</strong>
        </summary>
        <nav aria-label="Werkplek (mobiel)">{links}</nav>
      </details>
      <div className="staff-main">
        <Outlet />
      </div>
    </div>
  );
}
