import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { components } from '@biblio/api-client';
import { api, setCsrfToken } from './api';

export type SessionUser = components['schemas']['SessionUserDto'];
type Role = SessionUser['role'];

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  setUser: (u: SessionUser | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const setUser = useCallback((u: SessionUser | null) => {
    setCsrfToken(u?.csrfToken ?? null);
    setUserState(u);
  }, []);

  useEffect(() => {
    api
      .GET('/api/auth/me')
      .then(({ data }) => setUser(data ?? null))
      .finally(() => setLoading(false));
  }, [setUser]);

  const logout = useCallback(async () => {
    await api.POST('/api/auth/logout');
    setUser(null);
  }, [setUser]);

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth buiten AuthProvider');
  return ctx;
}

/** Beschermde route; optioneel beperkt tot rollen (de server dwingt dit ook af). */
export function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p>Laden…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <p role="alert">Geen toegang.</p>;
  return <>{children}</>;
}
