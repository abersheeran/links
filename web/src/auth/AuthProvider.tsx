import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Permission } from '../../../shared/permissions';
import { api, jsonBody, setCsrfToken } from '../lib/api';
import type { SessionData } from '../lib/types';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  session: SessionData | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function applySession(
  payload: SessionData,
  setSession: (session: SessionData | null) => void,
): void {
  setCsrfToken(payload.csrfToken);
  setSession(payload);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSessionState] = useState<SessionData | null>(null);

  const setSession = useCallback((value: SessionData | null) => {
    setSessionState(value);
    setStatus(value === null ? 'anonymous' : 'authenticated');
    if (value === null) {
      setCsrfToken(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const payload = await api<{ data: SessionData }>('/api/v1/auth/session');
      applySession(payload.data, setSessionState);
      setStatus('authenticated');
    } catch {
      setCsrfToken(null);
      setSessionState(null);
      setStatus('anonymous');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setCsrfToken(null);
      setSessionState(null);
      setStatus('anonymous');
    };
    window.addEventListener('links:unauthorized', handleUnauthorized);
    return () =>
      window.removeEventListener('links:unauthorized', handleUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const payload = await api<{ data: SessionData }>('/api/v1/auth/login', {
      method: 'POST',
      body: jsonBody({ email, password }),
    });
    applySession(payload.data, setSessionState);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await api<void>('/api/v1/auth/logout', { method: 'POST' });
    } catch {
      // Local cleanup must still happen if the server session already expired.
    } finally {
      setSession(null);
    }
  }, [setSession]);

  const can = useCallback(
    (permission: Permission) =>
      session?.permissions.includes(permission) ?? false,
    [session],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ status, session, login, logout, refresh, can }),
    [status, session, login, logout, refresh, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return value;
}
