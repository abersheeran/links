import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Permission } from '../../shared/permissions';
import { useAuth } from './auth/AuthProvider';
import { AppShell } from './components/AppShell';
import { LoadingScreen } from './components/LoadingScreen';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ApiKeysPage } from './pages/ApiKeysPage';
import { ForbiddenPage } from './pages/ForbiddenPage';
import { LinksPage } from './pages/LinksPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OverviewPage } from './pages/OverviewPage';
import { SettingsPage } from './pages/SettingsPage';
import { TeamPage } from './pages/TeamPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') {
    return <LoadingScreen />;
  }
  if (status === 'anonymous') {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { can } = useAuth();
  return can(permission) ? children : <ForbiddenPage />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/app" element={<OverviewPage />} />
        <Route path="/app/links" element={<LinksPage />} />
        <Route path="/app/analytics" element={<AnalyticsPage />} />
        <Route
          path="/app/team"
          element={
            <RequirePermission permission="users:manage">
              <TeamPage />
            </RequirePermission>
          }
        />
        <Route
          path="/app/api-keys"
          element={
            <RequirePermission permission="api_keys:manage">
              <ApiKeysPage />
            </RequirePermission>
          }
        />
        <Route path="/app/settings" element={<SettingsPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
