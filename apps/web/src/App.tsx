import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { RequireAuth, useAuth } from './auth';
import { NotificationBell } from './components/NotificationBell';
import { ThemeToggle } from './components/ThemeToggle';
import { BookDetailPage } from './pages/BookDetailPage';
import { CatalogPage } from './pages/CatalogPage';
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from './pages/AuthPages';
import { MyLoansPage } from './pages/MyLoansPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { PayMockPage } from './pages/PayMockPage';
import { SuggestionsPage } from './pages/SuggestionsPage';
import { WishlistPage } from './pages/WishlistPage';
import { AdminUsersPage } from './pages/staff/AdminUsersPage';
import { AuditPage } from './pages/staff/AuditPage';
import { ModerationPage } from './pages/staff/ModerationPage';
import { ReportsPage } from './pages/staff/ReportsPage';
import { TemplatesPage } from './pages/staff/TemplatesPage';
import { ProfilePage } from './pages/ProfilePage';
import { DeskPage } from './pages/staff/DeskPage';
import { LabelsPage } from './pages/staff/LabelsPage';
import { MemberDetailPage } from './pages/staff/MemberDetailPage';
import { MembersPage } from './pages/staff/MembersPage';
import { OverduePage } from './pages/staff/OverduePage';
import { ReservationsPage } from './pages/staff/ReservationsPage';
import { SettingsPage } from './pages/staff/SettingsPage';
import { BookFormPage } from './pages/staff/BookFormPage';
import { LookupsPage } from './pages/staff/LookupsPage';
import { StaffBooksPage } from './pages/staff/StaffBooksPage';

const STAFF: ('LIBRARIAN' | 'ADMIN')[] = ['LIBRARIAN', 'ADMIN'];

function Nav() {
  const { user, logout } = useAuth();
  return (
    <header className="nav">
      <Link to="/" className="brand">
        BiblioApp
      </Link>
      <nav aria-label="Hoofdmenu">
        <NavLink to="/" end>
          Catalogus
        </NavLink>
        {user && <NavLink to="/my/loans">Mijn uitleningen</NavLink>}
        {user && <NavLink to="/my/wishlist">Verlanglijst</NavLink>}
        {user && <NavLink to="/my/suggestions">Suggesties</NavLink>}
        {(user?.role === 'LIBRARIAN' || user?.role === 'ADMIN') && (
          <>
            <NavLink to="/staff/desk">Balie</NavLink>
            <NavLink to="/staff/members">Leden</NavLink>
            <NavLink to="/staff/overdue">Te laat</NavLink>
            <NavLink to="/staff/reservations">Reserveringen</NavLink>
            <NavLink to="/staff/moderation">Reviews</NavLink>
            <NavLink to="/staff/reports">Rapporten</NavLink>
            <NavLink to="/staff/books">Beheer</NavLink>
          </>
        )}
        {user?.role === 'ADMIN' && (
          <>
            <NavLink to="/admin/settings">Instellingen</NavLink>
            <NavLink to="/admin/users">Gebruikers</NavLink>
            <NavLink to="/admin/templates">Mailteksten</NavLink>
            <NavLink to="/admin/audit">Auditlog</NavLink>
          </>
        )}
        {user ? (
          <>
            <NotificationBell />
            <NavLink to="/profile">{user.name}</NavLink>
            <button className="link" onClick={() => void logout()}>
              Uitloggen
            </button>
          </>
        ) : (
          <NavLink to="/login">Inloggen</NavLink>
        )}
        <ThemeToggle />
      </nav>
    </header>
  );
}

export function App() {
  return (
    <>
      <a href="#main" className="skip">
        Naar de inhoud
      </a>
      <Nav />
      <main id="main">
        <Routes>
          <Route path="/" element={<CatalogPage />} />
          <Route path="/pay/mock/:ref" element={<PayMockPage />} />
          <Route
            path="/my/wishlist"
            element={
              <RequireAuth>
                <WishlistPage />
              </RequireAuth>
            }
          />
          <Route
            path="/my/suggestions"
            element={
              <RequireAuth>
                <SuggestionsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/staff/moderation"
            element={
              <RequireAuth roles={STAFF}>
                <ModerationPage />
              </RequireAuth>
            }
          />
          <Route
            path="/staff/reports"
            element={
              <RequireAuth roles={STAFF}>
                <ReportsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RequireAuth roles={['ADMIN']}>
                <AdminUsersPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/templates"
            element={
              <RequireAuth roles={['ADMIN']}>
                <TemplatesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/audit"
            element={
              <RequireAuth roles={['ADMIN']}>
                <AuditPage />
              </RequireAuth>
            }
          />
          <Route
            path="/notifications"
            element={
              <RequireAuth>
                <NotificationsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/staff/overdue"
            element={
              <RequireAuth roles={STAFF}>
                <OverduePage />
              </RequireAuth>
            }
          />
          <Route
            path="/staff/reservations"
            element={
              <RequireAuth roles={STAFF}>
                <ReservationsPage />
              </RequireAuth>
            }
          />
          <Route path="/books/:id" element={<BookDetailPage />} />
          <Route
            path="/staff/books"
            element={
              <RequireAuth roles={STAFF}>
                <StaffBooksPage />
              </RequireAuth>
            }
          />
          <Route
            path="/staff/books/:id"
            element={
              <RequireAuth roles={STAFF}>
                <BookFormPage />
              </RequireAuth>
            }
          />
          <Route
            path="/my/loans"
            element={
              <RequireAuth>
                <MyLoansPage />
              </RequireAuth>
            }
          />
          <Route
            path="/staff/desk"
            element={
              <RequireAuth roles={STAFF}>
                <DeskPage />
              </RequireAuth>
            }
          />
          <Route
            path="/staff/members"
            element={
              <RequireAuth roles={STAFF}>
                <MembersPage />
              </RequireAuth>
            }
          />
          <Route
            path="/staff/members/:id"
            element={
              <RequireAuth roles={STAFF}>
                <MemberDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="/staff/labels"
            element={
              <RequireAuth roles={STAFF}>
                <LabelsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <RequireAuth roles={['ADMIN']}>
                <SettingsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/staff/lookups"
            element={
              <RequireAuth roles={STAFF}>
                <LookupsPage />
              </RequireAuth>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
        </Routes>
      </main>
    </>
  );
}
