import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { RequireAuth, useAuth } from './auth';
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
import { ProfilePage } from './pages/ProfilePage';
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
        {(user?.role === 'LIBRARIAN' || user?.role === 'ADMIN') && (
          <NavLink to="/staff/books">Beheer</NavLink>
        )}
        {user ? (
          <>
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
