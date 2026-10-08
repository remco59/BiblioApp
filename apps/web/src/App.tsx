import { useEffect, useState } from 'react';
import type { Book } from '@biblio/api-client';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { api } from './api';
import { RequireAuth, useAuth } from './auth';
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from './pages/AuthPages';
import { ProfilePage } from './pages/ProfilePage';

export function BookList({ books }: { books: Book[] }) {
  return (
    <ul className="books">
      {books.map((b) => (
        <li key={b.id} className="book">
          <h2>{b.title}</h2>
          <p className="meta">
            {b.authors.map((a) => a.name).join(', ')}
            {b.genre ? ` · ${b.genre}` : ''}
            {b.publishedYear ? ` · ${b.publishedYear}` : ''}
          </p>
          <p className={b.copiesAvailable > 0 ? 'avail ok' : 'avail none'}>
            {b.copiesAvailable} van {b.copiesTotal} beschikbaar
          </p>
        </li>
      ))}
    </ul>
  );
}

function Catalog() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.GET('/api/books').then(({ data, error: err }) => {
      if (data) setBooks(data);
      else setError(String(err ?? 'Onbekende fout'));
    });
  }, []);

  return (
    <>
      <h1>Catalogus</h1>
      {error && <p role="alert">Kon boeken niet laden: {error}</p>}
      {!books && !error && <p>Laden…</p>}
      {books && <BookList books={books} />}
    </>
  );
}

function Nav() {
  const { user, logout } = useAuth();
  return (
    <header className="nav">
      <Link to="/" className="brand">
        BiblioApp
      </Link>
      <nav aria-label="Hoofdmenu">
        <NavLink to="/">Catalogus</NavLink>
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
      </nav>
    </header>
  );
}

export function App() {
  return (
    <>
      <Nav />
      <main>
        <Routes>
          <Route path="/" element={<Catalog />} />
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
